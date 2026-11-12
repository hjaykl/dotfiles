/**
 * workflow-modes: per-session toggles that steer how this pi works. No
 * kickoff, no pipeline — the main agent stays in charge; toggles change its
 * standing orders and which subagent tools it can reach.
 *
 *   /workflow                   toggle modes in a picker
 *   /workflow <mode> [on|off]   set one directly (implementer|reviewer|explorer|manualReview)
 *   /workflow status            print current modes
 *   /workflow review            open the Hunk review tab now
 *
 * Modes are per-session: saved in the session file (resume and reload keep
 * them), seeded from defaults.json for a new session (WORKFLOW_MODES=a,b
 * overrides). Role tools are registered with defaultActive: false and only
 * activated while their toggle is on — a disabled mode's tool is not visible
 * to the model at all.
 *
 * Subagents are hc templates (~/.config/herdr-core/templates/<role>.md: brief
 * + default model) spawned as interactive pi sessions in Herdr terminals the
 * person can watch and steer. They report via `hc send`; reports arrive as
 * <hc from="…"> input. Inside a spawned subagent (terminal labelled
 * workflow.role) this extension disables itself.
 */

import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TOGGLES = ["implementer", "reviewer", "explorer", "manualReview"] as const;
type Toggle = (typeof TOGGLES)[number];
const ROLE_TOOLS: Record<Exclude<Toggle, "manualReview">, string> = {
  implementer: "spawn_implementer",
  reviewer: "spawn_reviewer",
  explorer: "spawn_explorer",
};
const SHORT: Record<Toggle, string> = { implementer: "impl", reviewer: "rev", explorer: "expl", manualReview: "hunk" };
const STATUS_KEY = "workflow";
const ENTRY_TYPE = "workflow-modes";

function sh(cmd: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd, encoding: "utf8", timeout: 20_000 }, (err, stdout, stderr) =>
      err ? reject(new Error(stderr || String(err))) : resolve(stdout),
    );
  });
}

export default async function (pi: ExtensionAPI) {
  const extDir = dirname(fileURLToPath(import.meta.url));

  // ---- per-session toggle state -------------------------------------------

  const seed: Record<Toggle, boolean> = { implementer: false, reviewer: false, explorer: false, manualReview: false };
  try {
    Object.assign(seed, JSON.parse(readFileSync(join(extDir, "defaults.json"), "utf8")).toggles ?? {});
  } catch {}
  const fromEnv = process.env.WORKFLOW_MODES;
  if (fromEnv !== undefined) {
    for (const t of TOGGLES) seed[t] = fromEnv.split(",").map((s) => s.trim()).includes(t);
  }
  const toggles: Record<Toggle, boolean> = { ...seed };

  /** Saved with the session, so resume / reload / fork keep the modes. */
  function persist() {
    pi.appendEntry(ENTRY_TYPE, { ...toggles });
  }
  function restore(ctx: ExtensionContext) {
    try {
      let saved: any = null;
      for (const e of ctx.sessionManager.getBranch() as any[]) {
        if (e.type === "custom" && e.customType === ENTRY_TYPE) saved = e.data;
      }
      if (saved) for (const t of TOGGLES) if (typeof saved[t] === "boolean") toggles[t] = saved[t];
    } catch {}
  }

  let isSubagent = false;
  let lastCtx: ExtensionContext | null = null;
  /** hc terminal name → role, for subagents spawned by this session that haven't reported yet. */
  const active = new Map<string, Toggle>();
  let sawImplementerReport = false;
  let sawReviewerReport = false;
  /** Diff fingerprint at session start / last review open. */
  let lastReviewed: string | null | undefined;

  // ---- repo helpers ---------------------------------------------------------

  async function worktree(cwd: string): Promise<string | null> {
    try {
      return (await sh("git", ["-C", cwd, "rev-parse", "--show-toplevel"], cwd)).trim();
    } catch {
      return null;
    }
  }

  async function diffFingerprint(wt: string): Promise<string | null> {
    try {
      const [status, diff] = await Promise.all([
        sh("git", ["-C", wt, "status", "--porcelain=v1"], wt),
        sh("git", ["-C", wt, "diff", "--stat", "HEAD"], wt),
      ]);
      return createHash("sha1").update(status).update("\0").update(diff).digest("hex");
    } catch {
      return null; // no commits yet, etc.
    }
  }

  async function herdrSpace(): Promise<string | null> {
    try {
      const key = (await sh("bash", ["-c", '. "$HOME/.bin/lib/nvim-session.sh" && nvs_key'], homedir())).trim();
      return key.startsWith("herdr-") ? key.slice("herdr-".length) : null;
    } catch {
      return null;
    }
  }

  async function hunkTabOpen(space: string): Promise<boolean> {
    try {
      const data = JSON.parse(await sh("herdr-app", ["ls"], homedir()));
      return (data.spaces ?? []).some(
        (s: any) => s.id === space && (s.tabs ?? []).some((t: any) => t.name === "hunk"),
      );
    } catch {
      return false; // can't tell → don't block opening
    }
  }

  // ---- the person's Hunk review ---------------------------------------------

  async function openReview(ctx: ExtensionContext, force: boolean): Promise<string> {
    if (ctx.mode !== "tui") return "not interactive: skipping Hunk review";
    const wt = await worktree(ctx.cwd);
    if (!wt) return "not a git repo: skipping Hunk review";
    const fp = await diffFingerprint(wt);
    if (!fp) return "no diff available: skipping Hunk review";
    if (!force) {
      if (fp === lastReviewed) return "diff unchanged since last review";
      if (active.size > 0) return "subagents still running";
      // Reviewer mode on and an implementer just delivered: the reviewer pass
      // comes first; the person's review opens after it reports.
      if (toggles.reviewer && sawImplementerReport && !sawReviewerReport) return "waiting on reviewer pass";
      const space = await herdrSpace();
      if (space && (await hunkTabOpen(space))) return "hunk tab already open";
    }
    await sh(join(homedir(), ".bin", "hunk-open"), ["diff"], wt);
    lastReviewed = fp;
    sawImplementerReport = sawReviewerReport = false;
    return "opened Hunk review in a tab";
  }

  // ---- subagent spawning ------------------------------------------------------

  const parent = process.env.HC_TERMINAL_ID;

  function spawnTool(role: Exclude<Toggle, "manualReview">): ToolDefinition<any> {
    const tool = ROLE_TOOLS[role];
    const descriptions: Record<typeof role, string> = {
      implementer:
        "Delegate one tightly-scoped coding task to an implementer subagent (interactive pi in a Herdr terminal the user can watch and steer). Give a bounded brief: exact scope, files/areas, acceptance criteria, what NOT to touch. It works in the same worktree, commits with a clear message, runs only narrow targeted checks, then reports via hc. Returns immediately — do NOT wait or poll; the report arrives as <hc from=...> input; end your turn after spawning. After it reports, verify claims with git diff/log before summarizing.",
      reviewer:
        "Spawn a reviewer subagent to review the worktree diff (or a ref range), read-only. Use after an implementer reports, and after your own non-trivial changes, whenever reviewer mode is on: the reviewer pass comes before the user's manual review. It reports findings via hc. Returns immediately — do NOT wait; end your turn after spawning. When findings arrive: get them addressed (small fixes yourself, bigger lists back to the implementer) or push back with reasons, then re-review.",
      explorer:
        "Spawn an explorer subagent to answer a codebase question or map an area, read-only. Use when explorer mode is on and the answer needs more than a quick targeted look at one or two files. It writes findings to a file and reports the path via hc. Returns immediately — do NOT wait; end your turn after spawning.",
    };
    return {
      name: tool,
      label: `Spawn ${role}`,
      description: descriptions[role],
      promptSnippet: `spawn a ${role} subagent`,
      defaultActive: false,
      parameters: Type.Object({
        task: Type.String({ description: "The complete, self-contained brief for the subagent." }),
        name: Type.Optional(Type.String({ description: "Terminal name (1-32 of a-z 0-9 - _); default: generated." })),
        cwd: Type.Optional(Type.String({ description: "Working directory; default: this session's repo root." })),
      }),
      async execute(_id, params, _signal, _onUpdate, ctx) {
        lastCtx = ctx as unknown as ExtensionContext;
        if (!toggles[role]) {
          return { content: [{ type: "text", text: `${tool} is disabled. The user enables it with /workflow ${role} on.` }], details: undefined };
        }
        if (!parent) {
          return { content: [{ type: "text", text: "Not running inside Herdr (no HC_TERMINAL_ID): can't spawn subagents." }], details: undefined };
        }
        const cwd = params.cwd ?? (await worktree(ctx.cwd)) ?? ctx.cwd;
        const name = params.name ?? `${role}-${Math.random().toString(36).slice(2, 6)}`;
        const task = `${params.task}\n\nReport with: hc send ${parent} "<one line + any artifact path>" when done or stuck, then stay available for follow-ups.`;
        try {
          const out = await sh(
            "hc",
            ["run", "--bg", "--json", "--outlive-parent", "--name", name, "--cwd", cwd,
              "--label", `workflow.role=${role}`, "--label", `workflow.parent=${parent}`, role, task],
            ctx.cwd,
          );
          const t = JSON.parse(out);
          if (t.first_message && t.first_message.sent === false) {
            return { content: [{ type: "text", text: `Spawned ${name} but the task was NOT delivered (${t.first_message.reason ?? "not ready"}). Inspect with: hc read ${name}; resend with: hc send ${name} "..."` }], details: undefined };
          }
          active.set(t.name ?? name, role);
          return {
            content: [{ type: "text", text: `Spawned ${role} '${t.name ?? name}' (${t.address ?? "?"}), cwd ${cwd}. It reports back via hc — don't wait; continue or end your turn.` }],
            details: undefined,
          };
        } catch (e: any) {
          return { content: [{ type: "text", text: `Failed to spawn ${role}: ${e.message}` }], details: undefined };
        }
      },
    };
  }

  for (const role of Object.keys(ROLE_TOOLS) as (keyof typeof ROLE_TOOLS)[]) pi.registerTool(spawnTool(role));

  // ---- activation + status ----------------------------------------------------

  function statusText(): string | undefined {
    if (isSubagent) return undefined;
    const on = TOGGLES.filter((t) => toggles[t]);
    return on.length ? `wf: ${on.map((t) => SHORT[t]).join("·")}` : undefined;
  }

  function apply(ctx?: ExtensionContext | null) {
    const ours = new Set(Object.values(ROLE_TOOLS));
    const next = pi.getActiveTools().filter((t) => !ours.has(t));
    if (!isSubagent) {
      for (const [role, tool] of Object.entries(ROLE_TOOLS)) if (toggles[role as Toggle]) next.push(tool);
    }
    pi.setActiveTools(next);
    (ctx ?? lastCtx)?.ui.setStatus(STATUS_KEY, statusText());
  }

  // ---- events -------------------------------------------------------------------

  pi.on("session_start", async (_event, ctx) => {
    lastCtx = ctx;
    restore(ctx);
    // Gate first, synchronously, so no model request can go out with the
    // wrong tool set while the async subagent detection below is in flight.
    apply(ctx);
    // A spawned role agent (terminal labelled workflow.role) gets none of this.
    if (parent) {
      try {
        const self = JSON.parse(await sh("hc", ["get", parent, "--json"], ctx.cwd));
        isSubagent = Boolean(self.labels?.["workflow.role"]);
        if (isSubagent) apply(ctx);
      } catch {}
    }
    if (!isSubagent) {
      const wt = await worktree(ctx.cwd);
      lastReviewed = wt ? await diffFingerprint(wt) : null;
    }
    apply(ctx);
  });

  pi.on("before_agent_start", (event, ctx) => {
    lastCtx = ctx;
    if (isSubagent) return;

    // Subagent reports arrive as <hc from="t7 name"> user-type input.
    if (event.messageType === "user" && event.prompt?.includes("<hc from=")) {
      for (const [name, role] of [...active]) {
        if (event.prompt.includes(name)) {
          active.delete(name);
          if (role === "implementer") sawImplementerReport = true;
          if (role === "reviewer") sawReviewerReport = true;
        }
      }
    }

    const lines: string[] = [];
    if (toggles.implementer) {
      lines.push(
        "- IMPLEMENTER ON: Delegate coding tasks beyond a trivial single-file edit to an implementer subagent (spawn_implementer) with a tight brief: scope, files, acceptance criteria, what not to touch. Small bounded tasks; you keep design ownership and do trivial edits yourself. One implementer per disjoint area; don't stack overlapping ones. Don't wait after spawning — reports arrive as <hc from=\"…\"> input.",
      );
    }
    if (toggles.reviewer) {
      lines.push(
        "- REVIEWER ON: Any non-trivial diff gets a reviewer subagent pass (spawn_reviewer) before you report completion — the user's manual review opens only after it. Address findings (small fixes yourself, bigger lists back to the implementer) or push back with reasons, then re-review.",
      );
    }
    if (toggles.explorer) {
      lines.push(
        "- EXPLORER ON: For codebase questions needing more than a quick targeted look, delegate to an explorer subagent (spawn_explorer) instead of reading many files yourself.",
      );
    }
    if (toggles.manualReview) {
      lines.push(
        "- MANUAL REVIEW ON: When a settled round leaves the worktree diff changed (no subagents still running; reviewer pass done when reviewer is on), the user's Hunk review opens in a tab automatically. Their notes return as messages — address every one. Keep rounds small so reviews stay easy.",
      );
    }
    if (lines.length) {
      lines.push(
        "Subagents are interactive pi sessions in Herdr terminals the user can watch and steer. Treat their reports as claims to verify (git diff/log), not proof. Never spawn a subagent for a mode that is off.",
      );
      event.systemPromptOptions.sections.workflow_modes =
        "## Workflow modes (per-session, set by the user with /workflow)\n\nOnly the ON modes below apply.\n\n" + lines.join("\n");
    } else {
      delete event.systemPromptOptions.sections.workflow_modes;
    }
  });

  pi.on("agent_settled", async (event, ctx) => {
    lastCtx = ctx;
    if (event.aborted || isSubagent || !toggles.manualReview) return;
    if (lastReviewed === undefined) {
      const wt = await worktree(ctx.cwd);
      lastReviewed = wt ? await diffFingerprint(wt) : null;
      return;
    }
    await openReview(ctx, false);
  });

  // ---- /workflow ----------------------------------------------------------------

  pi.registerCommand("workflow", {
    description: "Per-session workflow modes: /workflow [mode on|off] | status | review",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      lastCtx = ctx;
      const parts = args.trim().split(/\s+/).filter(Boolean);

      if (parts[0] === "status") {
        ctx.ui.notify(`workflow modes: ${TOGGLES.map((t) => `${t}=${toggles[t] ? "on" : "off"}`).join("  ")}`, "info");
        return;
      }
      if (parts[0] === "review") {
        ctx.ui.notify(await openReview(ctx, true), "info");
        return;
      }
      if (parts.length > 0) {
        const mode = parts[0] as Toggle;
        if (!TOGGLES.includes(mode)) {
          ctx.ui.notify(`usage: /workflow [${TOGGLES.join("|")}] [on|off] | status | review`, "error");
          return;
        }
        toggles[mode] = parts[1] ? parts[1] === "on" : !toggles[mode];
        persist();
        apply(ctx);
        ctx.ui.notify(`workflow: ${mode} ${toggles[mode] ? "ON" : "OFF"} (this session)`, "info");
        return;
      }

      let changed = false;
      for (;;) {
        const opts = TOGGLES.map(
          (t) => `${toggles[t] ? "●" : "○"} ${t}${t === "manualReview" ? " — Hunk tab after each round" : " subagent"}`,
        );
        const choice = await ctx.ui.select("Workflow modes (this session)", [...opts, "done"]);
        if (choice === undefined || choice === "done") break;
        const idx = opts.indexOf(choice);
        if (idx < 0) continue;
        toggles[TOGGLES[idx]] = !toggles[TOGGLES[idx]];
        changed = true;
        apply(ctx);
      }
      if (changed) persist();
    },
  });
}
