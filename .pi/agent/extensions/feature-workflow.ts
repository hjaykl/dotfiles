/**
 * feature-workflow: kickoff, config picker and Hunk decisions for the feature
 * workflow skill (~/.agents/skills/feature).
 *
 *   /feature [--quick] <ticket | Linear URL | task>   start (or resume) a feature here
 *   /feature status                                   where are we
 *   /feature approve                                  approve the chunk under review (fallback for Hunk's A)
 *   /feature config                                   change roles/models for the rest of the feature
 *   /feature resume                                   reconnect from .plan.md + .feature/
 *
 * Tool workflow_config: the overseer proposes a config; the person adjusts it
 * in a picker of available models and presses Start (writes .feature/state.json
 * and switches this conversation to the overseer model).
 *
 * Role agents (terminals labelled feature.role) are read-only for the person:
 * typed input is refused (the overseer is the single point of contact); hc
 * messages still arrive. /unlock lifts that in one agent.
 *
 * The deterministic rules live in the skill's lib/ (shared with the `feature`
 * CLI): this file only adds the pi UI and the inbox watcher.
 */
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// The skill's library, imported statically so pi's loader (jiti, no module
// cache) re-reads it on every /reload. The path works from both the installed
// link (~/.pi/agent/extensions → ~/.agents/skills/feature) and the dotfiles
// copy (dotfiles/.pi/agent/extensions → dotfiles/.agents/skills/feature).
import * as configLib from "../../../.agents/skills/feature/lib/config.js";
import * as pickerLib from "../../../.agents/skills/feature/lib/picker.js";
import * as stateLib from "../../../.agents/skills/feature/lib/state.js";
import * as statusLib from "../../../.agents/skills/feature/lib/status.js";
import * as namesLib from "../../../.agents/skills/feature/lib/names.js";
import * as hcLib from "../../../.agents/skills/feature/lib/hc.js";
import * as utilLib from "../../../.agents/skills/feature/lib/util.js";

/** The skill directory: next to this file in the dotfiles checkout, else the installed one. */
function skillDir(): string {
  try {
    const real = realpathSync(fileURLToPath(import.meta.url));
    const dir = join(dirname(real), "..", "..", "..", ".agents", "skills", "feature");
    if (existsSync(join(dir, "lib", "state.js"))) return dir;
  } catch {}
  return process.env.FEATURE_SKILL_DIR || join(homedir(), ".agents", "skills", "feature");
}

type Lib = {
  config: any;
  picker: any;
  state: any;
  status: any;
  names: any;
  hc: any;
  util: any;
};

const STATUS_KEY = "feature";
const ROLES = ["researcher", "planner", "implementer", "reviewer"] as const;

export default async function (pi: ExtensionAPI) {
  const dir = skillDir();
  const lib: Lib = { config: configLib, picker: pickerLib, state: stateLib, status: statusLib, names: namesLib, hc: hcLib, util: utilLib };
  const defaultsPath = join(dir, "defaults.json");

  let watcher: ReturnType<typeof setInterval> | null = null;
  let watchedWt: string | null = null;
  let lastCtx: ExtensionContext | null = null;

  const worktree = (cwd: string): string => {
    try {
      return execFileSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
      return cwd;
    }
  };

  // ---- catalogue ------------------------------------------------------------

  function catalog(ctx: ExtensionContext) {
    const available = ctx.modelRegistry.getAvailable().map((m: any) => ({
      provider: m.provider,
      id: m.id,
      name: m.name,
      thinkingLevels: getSupportedThinkingLevels(m) as string[],
    }));
    const scoped = (ctx.scopedModels ?? []).map((s: any) => ({ provider: s.model.provider, id: s.model.id, thinkingLevel: s.thinkingLevel }));
    return { available, scoped: scoped.length ? scoped : null };
  }

  function currentModel(ctx: ExtensionContext) {
    return ctx.model ? { provider: ctx.model.provider, model: ctx.model.id, thinking: pi.getThinkingLevel() } : null;
  }

  // ---- picker ---------------------------------------------------------------

  async function pick(ctx: ExtensionContext, header: string, seed: any): Promise<{ config: any; save: boolean } | null> {
    const cat = catalog(ctx);
    if (!cat.available.length) {
      ctx.ui.notify("feature: no models are available (check /login)", "error");
      return null;
    }
    let config = seed;
    let save = false;
    let errors: string[] = [];
    const select = async (title: string, items: { id: string; label: string }[]) => {
      const label = await ctx.ui.select(title, items.map((i) => i.label));
      return label === undefined ? null : items.find((i) => i.label === label) ?? null;
    };
    const levelsFor = (slot: any) =>
      cat.available.find((m: any) => m.provider === slot?.provider && m.id === slot?.model)?.thinkingLevels ?? [];

    for (;;) {
      const title = [header, ...errors.map((e) => `⚠ ${e}`)].join("\n");
      const choice = await select(title, lib.picker.mainMenu(config, { save }));
      if (!choice || choice.id === "cancel") return null;
      errors = [];
      if (choice.id === "start") {
        const v = lib.config.validateConfig(config, cat);
        if (!v.ok) {
          errors = v.errors;
          continue;
        }
        return { config, save };
      }
      if (choice.id === "save") save = !save;
      else if (choice.id === "hunk") continue;
      else if (choice.id === "preset") {
        const p = await select("Preset (roles; Hunk review is always on)", lib.picker.presetMenu(config.preset));
        if (p) config = lib.picker.applyPreset(config, p.id);
      } else if (choice.id === "standards") {
        const text = await ctx.ui.input("Reviewer standards (comma-separated files, e.g. AGENTS.md)", (config.roles.reviewer.standards ?? []).join(", "));
        if (text !== undefined) config = lib.picker.setStandards(config, text);
      } else if (choice.id === "overseer" || choice.id.startsWith("role:")) {
        const slot = choice.id === "overseer" ? "overseer" : choice.id.slice(5);
        for (;;) {
          const cur = slot === "overseer" ? config.overseer : config.roles[slot];
          const items =
            slot === "overseer"
              ? [
                  { id: "model", label: `Model     ${lib.config.modelKey(cur)}` },
                  { id: "thinking", label: `Thinking  ${cur?.thinking ?? "?"}` },
                  { id: "back", label: "← Back" },
                ]
              : lib.picker.roleMenu(config, slot);
          const sub = await select(slot === "overseer" ? "Overseer (switches this conversation's model on Start)" : `${slot}`, items);
          if (!sub || sub.id === "back") break;
          if (sub.id === "toggle") config = lib.picker.toggleRole(config, slot);
          else if (sub.id === "model") {
            const m = await select(`Model for ${slot}${cat.scoped ? " (scoped models)" : ""}`, lib.picker.modelMenu(cat.available, cat.scoped, cur));
            if (m) config = lib.picker.setModel(config, slot, (m as any).model);
          } else if (sub.id === "thinking") {
            const levels = levelsFor(cur);
            if (!levels.length) {
              ctx.ui.notify("pick an available model first", "warning");
              continue;
            }
            const t = await select(`Thinking for ${slot} (${lib.config.modelKey(cur)} supports these)`, lib.picker.thinkingMenu(levels, cur.thinking));
            if (t) config = lib.picker.setThinking(config, slot, t.id);
          }
        }
      }
    }
  }

  /** Switch this conversation to the chosen overseer model (session only). */
  async function applyOverseer(ctx: ExtensionContext, overseer: any): Promise<string | null> {
    const model = ctx.modelRegistry.find(overseer.provider, overseer.model);
    if (!model) return `overseer model ${overseer.provider}/${overseer.model} not found`;
    const ok = await pi.setModel(model);
    if (!ok) return `no auth for ${overseer.provider}/${overseer.model}`;
    pi.setThinkingLevel(overseer.thinking);
    return null;
  }

  /**
   * Picker + Start: validate, write state (never over an existing one),
   * switch the overseer model. Returns a summary for the agent or person.
   */
  async function configureAndStart(ctx: ExtensionContext, feature: any, proposal: any, reasons?: string): Promise<{ ok: boolean; text: string }> {
    const wt = worktree(ctx.cwd);
    if (lib.state.hasState(wt)) return { ok: false, text: `A feature already exists in ${wt} (.feature/state.json). Resume it (/feature resume); nothing was overwritten.` };
    const defaults = lib.config.loadDefaults(defaultsPath);
    const seed = lib.config.seedConfig({ defaults, current: currentModel(ctx), proposal });
    const header = [`Feature config: ${feature.title}${feature.ticket ? ` (${feature.ticket})` : ""}`, ...(reasons ? reasons.split("\n").filter(Boolean).map((r) => `  ${r}`) : [])].join("\n");
    const picked = await pick(ctx, header, seed);
    if (!picked) return { ok: false, text: "Cancelled by the person in the picker: no state written, nothing started." };
    const err = await applyOverseer(ctx, picked.config.overseer);
    if (err) return { ok: false, text: `Not started: ${err}` };
    const config = lib.config.normalizeConfig({ ...picked.config, preset: lib.config.detectPreset(picked.config) });
    const id = lib.names.featureIdFor({ ticket: feature.ticket, task: feature.task ?? feature.title });
    const state = lib.state.initFeature(wt, {
      feature: { ...feature, id },
      config,
      overseer: lib.hc.overseerInfo(),
    });
    if (picked.save) lib.config.saveDefaults(defaultsPath, picked.config);
    startWatcher(ctx, wt);
    const dirty = state.feature.dirtyAtStart.length ? `\nWorktree had ${state.feature.dirtyAtStart.length} uncommitted file(s) at start: ask the person how they relate before implementing.` : "";
    return {
      ok: true,
      text: [
        `Started feature ${id} at ${state.feature.startCommit.slice(0, 8)} on ${state.feature.branch ?? "(detached)"}.`,
        ...lib.config.describeConfig(config),
        picked.save ? "Saved as defaults." : "",
        `State: ${lib.state.paths(wt).state}. Write .plan.md next (skill templates/plan.md).`,
      ].filter(Boolean).join("\n") + dirty,
    };
  }

  // ---- inbox: Hunk decisions --------------------------------------------------

  function describe(o: any): string {
    return lib.status.describeOutcome(o);
  }

  function nextStep(_state: any, o: any): string {
    if (o.duplicate) return "";
    if (o.legacyNotes) return o.delivered ? " The reviewer answers in Hunk and reports a fix list; nothing for you to do yet." : " Send this file to the chunk's reviewer yourself.";
    if (!o.accepted) return " Ignored: tell the person briefly why; do nothing else.";
    return ` Chunk ${o.chunk} is approved${o.noteCount ? " (notes kept as non-blocking comments: no fixes)" : ""}. Clean up its agents and continue with the next chunk, or finish.`;
  }

  function processInbox(ctx: ExtensionContext, wt: string, opts: { triggerTurn: boolean }): string[] {
    if (!lib.state.hasState(wt) || !lib.state.inboxFiles(wt).length) return [];
    let outcomes: any[] = [];
    try {
      outcomes = lib.state.ingestInbox(wt).map((o: any) => {
        if (!o.legacyNotes) return o;
        const r = lib.hc.sendNotes(o);
        return { ...o, delivered: r.ok, deliveryError: r.error };
      });
    } catch (e: any) {
      ctx.ui.notify(`feature inbox: ${e.message}`, "error");
      return [];
    }
    const state = lib.state.loadState(wt);
    lib.status.refreshPlanStatus(state);
    updateStatus(ctx, state);
    const lines = outcomes.filter((o) => !o.duplicate).map((o) => `${describe(o)}.${nextStep(state, o)}`);
    if (lines.length)
      pi.sendMessage(
        { customType: "feature-hunk", content: `Hunk review update:\n${lines.map((l) => `- ${l}`).join("\n")}`, display: true },
        { triggerTurn: opts.triggerTurn, deliverAs: "steer" },
      );
    return lines;
  }

  function startWatcher(ctx: ExtensionContext, wt: string) {
    lastCtx = ctx;
    if (watcher && watchedWt === wt) return;
    stopWatcher();
    watchedWt = wt;
    watcher = setInterval(() => {
      if (lastCtx && watchedWt) processInbox(lastCtx, watchedWt, { triggerTurn: true });
    }, 2000);
    try {
      updateStatus(ctx, lib.state.loadState(wt));
    } catch {}
  }

  function stopWatcher() {
    if (watcher) clearInterval(watcher);
    watcher = null;
    watchedWt = null;
  }

  function updateStatus(ctx: ExtensionContext, state: any) {
    const open = lib.state.currentReview(state);
    const cur = state.chunks.find((c: any) => c.status !== "approved");
    const what = open ? `chunk ${open.chunk.n} in your Hunk review` : cur ? `chunk ${cur.n} ${cur.status.replace("_", " ")}` : state.phase;
    ctx.ui.setStatus(STATUS_KEY, `◆ ${state.feature.ticket ?? state.feature.id} · ${what}`);
  }

  // ---- decisions typed in the overseer (fallback for Hunk keys) -----------------

  async function commandDecision(ctx: ExtensionCommandContext, decision: "approve", text: string) {
    const wt = worktree(ctx.cwd);
    if (!lib.state.hasState(wt)) return ctx.ui.notify("No feature in this worktree", "error");
    if (!amOverseer(wt)) return ctx.ui.notify("Decide in the overseer's pi (or in Hunk), not in a role agent", "error");
    const state = lib.state.loadState(wt);
    const open = lib.state.currentReview(state);
    if (!open) return ctx.ui.notify("No chunk is waiting for your review", "warning");
    const { chunk, round } = open;
    const label = `chunk ${chunk.n} round ${round.round} (${round.base.slice(0, 8)}..${round.tip.slice(0, 8)})`;
    const ok = await ctx.ui.confirm(`Approve ${label}?`, "Approval overrides any reviewer findings.");
    if (!ok) return;
    const d = {
      type: "feature-decision",
      id: lib.util.randomId(12),
      decision,
      source: "command",
      at: new Date().toISOString(),
      featureId: state.feature.id,
      chunk: chunk.n,
      round: round.round,
      base: round.base,
      tip: round.tip,
      nonce: round.nonce,
      hunkSession: round.hunkSession ?? null,
      ...(text.trim() ? { summary: text.trim() } : {}),
      notes: [],
      agentNotes: [],
    };
    lib.state.writeInbox(wt, d);
    processInbox(ctx, wt, { triggerTurn: true });
  }

  // ---- command -------------------------------------------------------------------

  pi.registerCommand("feature", {
    description: "Feature workflow: /feature [--quick] <ticket|URL|task> · status · approve · config · resume",
    getArgumentCompletions: (prefix: string) => {
      const subs = ["status", "approve", "config", "resume", "--quick"];
      const items = subs.filter((s) => s.startsWith(prefix)).map((s) => ({ value: s, label: s }));
      return items.length ? items : null;
    },
    handler: async (rawArgs, ctx) => {
      if (role) return ctx.ui.notify(`This is the ${role}: use /feature in the overseer`, "warning");
      const args = (rawArgs ?? "").trim();
      const [sub, ...rest] = args.split(/\s+/);
      const wt = worktree(ctx.cwd);
      const exists = lib.state.hasState(wt);

      if (sub === "status") {
        if (!exists) return ctx.ui.notify("No feature in this worktree", "info");
        if (amOverseer(wt)) processInbox(ctx, wt, { triggerTurn: false });
        const state = lib.state.loadState(wt);
        const lines = lib.status.statusLines(state, statusFacts(wt, state));
        pi.sendMessage({ customType: "feature-status", content: lines.join("\n"), display: true }, { triggerTurn: false });
        return;
      }
      if (sub === "approve") return commandDecision(ctx, "approve", rest.join(" "));
      if (sub === "config") {
        if (!exists) return ctx.ui.notify("No feature in this worktree: /feature <ticket|task> starts one", "info");
        const state = lib.state.loadState(wt);
        const seed = { ...state.config, roles: Object.fromEntries(ROLES.map((r) => [r, { ...state.config.roles[r], ...(state.config.roles[r].enabled ? {} : seedRole(ctx, r)) }])) };
        const picked = await pick(ctx, `Change config for ${state.feature.id} (applies to agents started from now on)`, seed);
        if (!picked) return ctx.ui.notify("Config unchanged", "info");
        const err = await applyOverseer(ctx, picked.config.overseer);
        if (err) return ctx.ui.notify(err, "error");
        lib.state.updateState(wt, (s: any) => {
          s.config = lib.config.normalizeConfig({ ...picked.config, preset: lib.config.detectPreset(picked.config) });
          s.configChanges = [...(s.configChanges ?? []), { at: new Date().toISOString(), config: s.config }];
        });
        if (picked.save) lib.config.saveDefaults(defaultsPath, picked.config);
        pi.sendMessage({ customType: "feature-status", content: `Feature config changed by the person:\n${lib.config.describeConfig(lib.state.loadState(wt).config).join("\n")}`, display: true }, { triggerTurn: false });
        return;
      }
      if (sub === "resume" || (!args && exists)) {
        if (!exists) return ctx.ui.notify("No feature in this worktree", "info");
        if (!args) {
          const c = await ctx.ui.select("A feature already exists here", ["Resume it", "Show status", "Cancel"]);
          if (c === "Show status") return pi.sendUserMessage("/feature status", { expandPromptTemplates: true });
          if (c !== "Resume it") return;
        }
        if (!(await claimOverseer(ctx, wt))) return;
        startWatcher(ctx, wt);
        await ctx.waitForIdle();
        pi.sendUserMessage("/skill:feature resume", { expandPromptTemplates: true });
        return;
      }

      // Kickoff.
      const quick = sub === "--quick";
      let input = quick ? rest.join(" ") : args;
      if (exists) {
        const c = await ctx.ui.select(`A feature already exists in this worktree (.feature/state.json)`, ["Resume it", "Cancel (nothing is overwritten)"]);
        if (c === "Resume it") {
          if (!(await claimOverseer(ctx, wt))) return;
          startWatcher(ctx, wt);
          await ctx.waitForIdle();
          pi.sendUserMessage("/skill:feature resume", { expandPromptTemplates: true });
        }
        return;
      }
      if (!input) {
        const t = await ctx.ui.input("Feature: Linear ticket (FLE-123), Linear URL, or describe the task", "");
        if (!t?.trim()) return;
        input = t.trim();
      }
      const ticket = lib.names.parseTicket(input);
      const kind = ticket ? `ticket ${ticket.ticket}${ticket.url ? ` (${ticket.url})` : ""}${ticket.rest ? `; extra brief: ${ticket.rest}` : ""}` : `task brief: ${input}`;
      if (!quick) {
        await ctx.waitForIdle();
        pi.sendUserMessage(`/skill:feature kickoff · ${kind}`, { expandPromptTemplates: true });
        return;
      }
      const feature = ticket
        ? { ticket: ticket.ticket, url: ticket.url ?? null, title: ticket.ticket, task: ticket.rest || null }
        : { ticket: null, url: null, title: input.slice(0, 80), task: input };
      const r = await configureAndStart(ctx, feature, {});
      if (!r.ok) return ctx.ui.notify(r.text, "warning");
      await ctx.waitForIdle();
      pi.sendUserMessage(`/skill:feature quick-started · ${kind}\n\nThe person configured and started the workflow with Start in the picker:\n${r.text}`, { expandPromptTemplates: true });
    },
  });

  function seedRole(ctx: ExtensionContext, role: string) {
    const d = lib.config.loadDefaults(defaultsPath).roles?.[role];
    const cur = currentModel(ctx);
    return d ?? cur ?? {};
  }

  function statusFacts(wt: string, state: any) {
    const g = (args: string[]) => {
      try {
        return execFileSync("git", ["-C", wt, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      } catch {
        return null;
      }
    };
    const agents: Record<string, any> = {};
    for (const [name, a] of Object.entries<any>(state.agents)) if (a.status === "live") agents[name] = lib.hc.getTerminal(a.address ?? name);
    const porcelain = g(["status", "--porcelain=v1"]);
    return { head: g(["rev-parse", "HEAD"]), branch: g(["symbolic-ref", "--short", "HEAD"]), dirty: porcelain ? porcelain.split("\n") : [], agents, inbox: lib.state.inboxFiles(wt).length };
  }

  // ---- tool ------------------------------------------------------------------------

  const slot = Type.Object({
    enabled: Type.Optional(Type.Boolean()),
    provider: Type.Optional(Type.String()),
    model: Type.Optional(Type.String({ description: "model id exactly as listed by the registry" })),
    thinking: Type.Optional(Type.String()),
  });

  pi.registerTool({
    name: "workflow_config",
    label: "Feature config",
    description:
      "Open the feature-workflow configuration picker for the person (preset, roles, per-role provider/model/thinking from available models, reviewer standards, save as defaults). " +
      "The person adjusts and presses Start, which writes .feature/state.json and switches this conversation to the chosen overseer model. Returns the final config or that it was cancelled.",
    promptSnippet: "Open the feature-workflow config picker (kickoff only)",
    promptGuidelines: [
      "Use workflow_config only during feature kickoff (the feature skill), after discussing the preset with the person; never to change state otherwise.",
    ],
    executionMode: "sequential",
    parameters: Type.Object({
      feature: Type.Object({
        title: Type.String({ description: "short feature title (ticket title or task summary)" }),
        ticket: Type.Optional(Type.String()),
        url: Type.Optional(Type.String()),
        task: Type.Optional(Type.String({ description: "plain-language brief when there is no ticket, or extra brief" })),
      }),
      proposal: Type.Object({
        preset: Type.String({ description: "tiny | medium | full" }),
        overseer: Type.Optional(slot),
        roles: Type.Optional(Type.Record(Type.String(), slot)),
        standards: Type.Optional(Type.Array(Type.String())),
      }),
      reasons: Type.Optional(Type.String({ description: "one short line per proposed choice, shown in the picker" })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      if (role) return { content: [{ type: "text", text: "workflow_config is for the overseer only" }], details: { ok: false }, isError: true };
      if (!ctx.hasUI || ctx.mode !== "tui") return { content: [{ type: "text", text: "workflow_config needs the interactive pi UI" }], details: { ok: false }, isError: true };
      const r = await configureAndStart(ctx, { ticket: params.feature.ticket ?? null, url: params.feature.url ?? null, title: params.feature.title, task: params.feature.task ?? null }, params.proposal, params.reasons);
      return { content: [{ type: "text", text: r.text }], details: { ok: r.ok } };
    },
  });

  // ---- lifecycle -------------------------------------------------------------------

  // Only the overseer watches the inbox. Role agents run pi in the same
  // worktree with this extension loaded; they must never pick up decisions.
  const thisTerminal = process.env.HC_TERMINAL_ID ?? null;
  const amOverseer = (wt: string) => {
    try {
      return lib.state.isOverseerTerminal(lib.state.loadState(wt), thisTerminal);
    } catch {
      return false;
    }
  };

  /** /feature resume in a fresh pi: this terminal becomes the overseer. */
  async function claimOverseer(ctx: ExtensionCommandContext, wt: string): Promise<boolean> {
    const state = lib.state.loadState(wt);
    if (lib.state.isOverseerTerminal(state, thisTerminal)) return true;
    if (!thisTerminal) {
      ctx.ui.notify("feature: run the overseer inside Herdr/hc (no HC_TERMINAL_ID)", "error");
      return false;
    }
    if (Object.values<any>(state.agents).some((a) => a.address === thisTerminal)) {
      ctx.ui.notify("This pi is one of the feature's role agents, not the overseer", "error");
      return false;
    }
    const prev = state.overseer?.terminal;
    const live = prev ? lib.hc.getTerminal(prev) : null;
    if (live && live.state === "live") {
      const ok = await ctx.ui.confirm("Take over as overseer?", `${prev} is still running as this feature's overseer. Make this pi (${thisTerminal}) the overseer instead? Agents will report here.`);
      if (!ok) return false;
    }
    lib.state.updateState(wt, (s: any) => {
      s.overseer = { ...lib.hc.overseerInfo(), previous: prev ?? null };
    });
    return true;
  }

  // ---- role agents: read-only for the person ----------------------------------

  let role: string | null = null;
  let unlocked = false;
  let started = false; // the first input is the launch task (argv): let it through

  function isDelivered(text: string): boolean {
    const t = text.trimStart();
    return /^<hc[\s>]/.test(t) || /^<hunk-notes[\s>]/.test(t) || /^Hunk notes from the person on chunk \d+/.test(t);
  }

  function ownRole(): string | null {
    if (!thisTerminal) return null;
    try {
      const t = JSON.parse(execFileSync("hc", ["get", thisTerminal, "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000 }));
      return t?.labels?.["feature.role"] ?? null;
    } catch {
      return null;
    }
  }

  pi.on("input", async (event, ctx) => {
    if (!role || unlocked) return { action: "continue" };
    if (!started) {
      started = true;
      return { action: "continue" };
    }
    if (event.source !== "interactive") return { action: "continue" };
    // Let through what agents and tools deliver, refuse the person's typing:
    // hc messages from agents (<hc from="…">), hc's own notes (<hc>…</hc>: a
    // background check exited, a child blocked) and Hunk notes, which hc sends
    // untagged from Hunk's non-agent terminal, so pi-send tags them itself
    // (<hunk-notes …>; older Hunk windows: "Hunk notes from the person on chunk N").
    if (isDelivered(event.text)) return { action: "continue" };
    ctx.ui.notify(`This is the ${role} (read-only): talk to the overseer instead. /unlock to type here anyway.`, "warning");
    return { action: "handled" };
  });

  pi.registerCommand("unlock", {
    description: "Feature role agents: allow typing to this agent directly (the overseer is the normal contact)",
    handler: async (_args, ctx) => {
      if (!role) return ctx.ui.notify("Not a feature role agent: nothing to unlock", "info");
      unlocked = !unlocked;
      ctx.ui.setStatus(STATUS_KEY, unlocked ? `◆ ${role} · unlocked` : `◆ ${role} · read-only: talk to the overseer`);
      ctx.ui.notify(unlocked ? "Unlocked: what you type goes to this agent (tell the overseer what you decided)" : "Read-only again", "info");
    },
  });

  pi.on("session_start", async (_e, ctx) => {
    role = ownRole();
    if (role) {
      ctx.ui.setStatus(STATUS_KEY, `◆ ${role} · read-only: talk to the overseer`);
      return;
    }
    const wt = worktree(ctx.cwd);
    if (lib.state.hasState(wt) && amOverseer(wt)) startWatcher(ctx, wt);
  });
  // Keep the overseer's status line current after each of its turns (it
  // changes state through the feature CLI, outside this extension).
  pi.on("agent_settled", async (_e, ctx) => {
    if (!watchedWt) return;
    try {
      updateStatus(ctx, lib.state.loadState(watchedWt));
    } catch {}
  });
  pi.on("session_shutdown", async () => stopWatcher());
}
