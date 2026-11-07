// hc integration: spawn role agents, look them up, clean up owned ones.
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { agentName } from "./names.js";

export const SKILL_DIR = process.env.FEATURE_SKILL_DIR || join(homedir(), ".agents", "skills", "feature");

export function hc(args, opts = {}) {
  return execFileSync(opts.bin ?? process.env.FEATURE_HC_BIN ?? "hc", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: opts.timeout ?? 30_000,
  }).trim();
}

export function hcJson(args, opts) {
  return JSON.parse(hc([...args, "--json"], opts));
}

/** Names of live terminals, for collision-free agent names. */
export function liveNames(opts) {
  try {
    const out = hcJson(["ls"], opts);
    return new Set((out.terminals ?? []).map((t) => t.name).filter(Boolean));
  } catch {
    return new Set();
  }
}

/** hc get, or null when the terminal is gone. */
export function getTerminal(t, opts) {
  try {
    return hcJson(["get", t], opts);
  } catch {
    return null;
  }
}

/**
 * The hc run argv for a role agent. Interactive pi (never -p), first task in
 * argv (no readiness race), outlives the overseer, listed in Herdr under the
 * overseer (read-only for the person; the overseer is their contact).
 */
export function spawnArgv({ state, role, chunk, name, task, space, skillDir = SKILL_DIR }) {
  const r = state.config.roles[role];
  if (!r?.enabled) throw new Error(`${role} is not enabled in this feature's config`);
  const labels = [
    `feature.id=${state.feature.id}`,
    `feature.role=${role}`,
    ...(chunk != null ? [`feature.chunk=${chunk}`] : []),
  ];
  // No herdr.space label: as the overseer's hc children, agents already show
  // nested under it in Herdr's agents list (peek to watch one). A space label
  // would also adopt each as its own top-level tab: listed twice.
  return [
    "run", "--bg", "--json", "--outlive-parent",
    "--name", name,
    "--cwd", state.feature.worktree,
    ...labels.flatMap((l) => ["--label", l]),
    "--",
    "pi",
    "--provider", r.provider,
    "--model", r.model,
    "--thinking", r.thinking,
    "--name", name,
    "--append-system-prompt", join(skillDir, "roles", "common.md"),
    "--append-system-prompt", join(skillDir, "roles", `${role}.md`),
    task,
  ];
}

/** Default first message: who you are, who to report to, what to read. */
export function defaultTask({ state, role, chunk, name, overseer, brief }) {
  const where = chunk != null ? ` for chunk ${chunk}` : "";
  return [
    `You are ${name}, the ${role}${where} of feature ${state.feature.id} ("${state.feature.title}").`,
    `Worktree: ${state.feature.worktree}. Overseer: ${overseer} (report with: hc send ${overseer} "<one line + artifact path>").`,
    `Start by reading ${brief}.`,
  ].join(" ");
}

export function pickName(state, role, chunk, opts) {
  const taken = liveNames(opts);
  for (const n of Object.keys(state.agents)) if (state.agents[n].status === "live") taken.add(n);
  return agentName(state.feature.id, role, chunk, taken);
}

/** Kill + remove a terminal only if its labels say this feature owns it. */
export function killOwned(state, name, opts) {
  const t = getTerminal(state.agents[name]?.address ?? name, opts);
  if (!t) return { name, result: "gone" };
  if (t.labels?.["feature.id"] !== state.feature.id) return { name, result: "not owned: left alone" };
  try {
    hc(["kill", t.address ?? name], opts);
  } catch {}
  try {
    hc(["rm", t.address ?? name], opts);
  } catch {}
  return { name, result: "killed" };
}

/** The overseer: this terminal and its Herdr space (where role agents appear). */
export function overseerInfo() {
  const terminal = process.env.HC_TERMINAL_ID || null;
  let space = null;
  if (terminal) {
    const t = getTerminal(terminal);
    space = t?.labels?.["herdr.space"] ?? null;
  }
  return { terminal, space, session: process.env.PI_SESSION_FILE ?? null };
}

/**
 * Hand the person's Hunk notes (a file) to the chunk's reviewer (or the
 * implementer when there is no reviewer), as a v2 `p` would.
 */
export function sendNotes(o, opts) {
  if (!o.notesTo) return { ok: false, error: "no reviewer or implementer recorded for this chunk" };
  const text =
    `Hunk notes from the person on chunk ${o.chunk}, round ${o.round} (${o.noteCount} note(s), Hunk session ${o.hunkSession ?? "unknown"}): ${o.notesFile}. ` +
    "As this chunk's reviewer: answer every question in Hunk (feature reply <note id> --text \"...\"); put every change the person asks for " +
    `in .feature/reviews/c${o.chunk}-r${o.round}-fixes.md (never drop one); say in Hunk what you are sending for fixing; then report to the overseer in one line.`;
  try {
    hc(["send", o.notesTo, text], opts);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e.stderr || e.message).trim().split("\n").pop() };
  }
}
