// Status: one short answer from state + git + hc, and the status block in .plan.md.
import { existsSync, readFileSync } from "node:fs";
import { latestRound } from "./review.js";
import { paths } from "./state.js";
import { shortSha, writeFileAtomic } from "./util.js";
import { enabledRoles } from "./config.js";

const CHUNK_LABEL = {
  todo: "todo",
  in_progress: "implementing",
  committed: "committed, reviewer next",
  in_review: "in review (waiting for you in Hunk)",
  changes_requested: "changes requested, implementer fixing",
  // v2: fixes happen while the round is open; a new commit supersedes it.
  approved: "approved",
};

/**
 * @param facts {{ head?: string, dirty?: string[], branch?: string, agents?: Record<string,{state?:string,status?:string}|null>, inbox?: number }}
 */
export function statusLines(state, facts = {}) {
  const f = state.feature;
  const lines = [];
  lines.push(`Feature: ${f.title}${f.ticket ? ` (${f.ticket})` : ""} · preset ${state.config.preset} · phase ${state.phase}`);
  const done = state.chunks.filter((c) => c.status === "approved").length;
  if (state.chunks.length) {
    lines.push(`Chunks: ${done}/${state.chunks.length} approved`);
    for (const c of state.chunks) {
      if (c.status === "approved" && c !== state.chunks[state.chunks.length - 1]) continue;
      const r = latestRound(c);
      const rev = c.tip ? ` @ ${shortSha(c.tip)}` : "";
      const round = r ? ` · round ${r.round} ${r.status.replace("_", " ")}` : "";
      lines.push(`  ${c.n}. ${c.title}: ${CHUNK_LABEL[c.status] ?? c.status}${rev}${round}`);
      if (c.status === "todo") break;
    }
  } else {
    lines.push("Chunks: none yet (plan not approved)");
  }
  const agents = Object.entries(state.agents).filter(([, a]) => a.status === "live");
  if (agents.length) {
    const desc = agents.map(([name, a]) => {
      const live = facts.agents?.[name];
      const st = live === null ? "LOST" : live?.status?.state ?? live?.status ?? live?.state ?? "?";
      return `${name} ${typeof st === "string" ? st : "?"}`;
    });
    lines.push(`Agents: ${desc.join(" · ")}`);
  } else {
    lines.push("Agents: none running");
  }
  const blocked = Object.entries(facts.agents ?? {}).filter(([, t]) => (t?.status?.state ?? t?.status) === "blocked").map(([n]) => n);
  lines.push(`Waiting on you: ${waitingOn(state, blocked)}`);
  if (state.blockers?.length) lines.push(`Blockers: ${state.blockers.map((b) => b.text).join("; ")}`);
  if (facts.inbox) lines.push(`Unprocessed Hunk decisions/notes: ${facts.inbox}`);
  if (facts.head) {
    const dirty = facts.dirty?.length ? `${facts.dirty.length} uncommitted file(s)` : "clean";
    lines.push(`Git: ${facts.branch ?? f.branch ?? "?"} · HEAD ${shortSha(facts.head)} · ${dirty} · started at ${shortSha(f.startCommit)}`);
  }
  if (state.pr?.url) lines.push(`Draft PR: ${state.pr.url}`);
  return lines;
}

function waitingOn(state, blocked) {
  const items = [];
  if (blocked.length) items.push(`${blocked.join(", ")} (blocked: answer in its pane)`);
  for (const c of state.chunks) {
    const r = latestRound(c);
    if (r?.status === "open") items.push(`Hunk review of chunk ${c.n} round ${r.round}`);
  }
  if (state.phase === "research" && !items.length) items.push("possibly the researcher's questions (check its pane)");
  if (state.phase === "planning" && !items.length) items.push("possibly plan approval in the planner's pane");
  return items.length ? items.join("; ") : "nothing";
}

const START = "<!-- feature:status -->";
const END = "<!-- /feature:status -->";

/** Status block for .plan.md: steps with their state, readable without the JSON. */
export function planStatusBlock(state) {
  const lines = [START, "## Status", ""];
  lines.push(`Phase: ${state.phase} · Roles: ${enabledRoles(state.config).join(", ")} + Hunk review`);
  lines.push("");
  if (state.chunks.length) {
    for (const c of state.chunks) {
      const r = latestRound(c);
      const mark = c.status === "approved" ? "x" : " ";
      const rev = c.tip ? ` · ${shortSha(c.tip)}` : "";
      const round = r ? ` · round ${r.round}` : "";
      lines.push(`- [${mark}] ${c.n}. ${c.title} · ${CHUNK_LABEL[c.status] ?? c.status}${rev}${round}`);
    }
  } else {
    lines.push("No chunks yet.");
  }
  if (state.blockers?.length) {
    lines.push("", "Blockers:");
    for (const b of state.blockers) lines.push(`- ${b.text}`);
  }
  if (state.pr?.url) lines.push("", `Draft PR: ${state.pr.url}`);
  lines.push(END);
  return lines.join("\n");
}

/** Replace (or append) the status block; the rest of .plan.md is the overseer's prose. */
export function refreshPlanStatus(state) {
  const p = paths(state.feature.worktree).plan;
  if (!existsSync(p)) return false;
  const text = readFileSync(p, "utf8");
  const block = planStatusBlock(state);
  const i = text.indexOf(START);
  const j = text.indexOf(END);
  const next = i >= 0 && j > i ? text.slice(0, i) + block + text.slice(j + END.length) : `${text.replace(/\s*$/, "")}\n\n${block}\n`;
  if (next !== text) writeFileAtomic(p, next);
  return true;
}

/** One line per processed inbox file, for the overseer. */
export function describeOutcome(o) {
  if (o.duplicate) return `already recorded: ${o.file}`;
  if (o.legacyNotes)
    return `chunk ${o.chunk} round ${o.round}: ${o.noteCount} note(s) from the person (sent with p from an older Hunk window) · ${o.notesFile}` +
      (o.delivered === true ? ` · delivered to ${o.notesTo}` : o.delivered === false ? ` · NOT delivered to ${o.notesTo ?? "anyone"} (${o.deliveryError}): send it yourself` : "");
  const what = { approve: "APPROVED" }[o.decision] ?? o.decision;
  if (!o.accepted) return `IGNORED ${what ?? "decision"} for chunk ${o.chunk} round ${o.round}: ${o.reason}${o.notesFile ? ` · notes: ${o.notesFile}` : ""}`;
  return `chunk ${o.chunk} round ${o.round}: ${what}${o.stale ? " (on an older revision)" : ""} · ${o.noteCount} note(s) · ${o.notesFile}`;
}
