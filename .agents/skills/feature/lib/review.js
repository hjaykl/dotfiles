// Review rounds and decisions. Pure functions over the state object, so the
// rules that stop a stale or wrong approval advancing the feature are testable.
import { nowIso, randomId, shortSha } from "./util.js";

// v2: the only formal decision is the person's approval. Notes go from Hunk
// straight to the chunk's reviewer and are not decisions.
export const DECISIONS = ["approve"];

export function latestRound(chunk) {
  return chunk?.rounds?.length ? chunk.rounds[chunk.rounds.length - 1] : null;
}

/** Reviewer findings recorded for exactly this revision (base..tip), if any. */
export function reviewFor(chunk, tip) {
  return [...(chunk.reviews ?? [])].reverse().find((r) => r.tip === tip && r.base === chunk.base) ?? null;
}

/**
 * Open a new Hunk round for the chunk's current revision. A still-open older
 * round is superseded: its decisions can no longer advance anything.
 */
export function openRound(chunk, { requireReview }) {
  if (!chunk.tip) throw new Error(`chunk ${chunk.n} has no committed revision yet`);
  const review = reviewFor(chunk, chunk.tip);
  if (requireReview && !review)
    throw new Error(`chunk ${chunk.n}: no reviewer findings recorded for ${shortSha(chunk.tip)} (run the reviewer on ${shortSha(chunk.base)}..${shortSha(chunk.tip)} first)`);
  for (const r of chunk.rounds ?? []) if (r.status === "open") r.status = "superseded";
  const round = {
    round: (chunk.rounds?.length ?? 0) + 1,
    base: chunk.base,
    tip: chunk.tip,
    nonce: randomId(8),
    openedAt: nowIso(),
    status: "open",
    reviewReport: review?.report ?? null,
    findings: review?.findings ?? [],
    hunkSession: null,
    decisions: [],
  };
  chunk.rounds = [...(chunk.rounds ?? []), round];
  chunk.status = "in_review";
  return round;
}

/**
 * Check that a decision belongs to the round the person is looking at and
 * that the code has not moved since.
 * @param d {{ id, decision, featureId, chunk, round, nonce, base, tip }}
 * @param facts {{ head: string }}
 */
export function validateDecision(state, d, facts) {
  const fail = (reason) => ({ ok: false, reason });
  if (!DECISIONS.includes(d.decision)) return fail(`unknown decision "${d.decision}"`);
  if (d.featureId !== state.feature.id) return fail(`decision is for feature ${d.featureId}, this is ${state.feature.id}`);
  const chunk = state.chunks.find((c) => c.n === d.chunk);
  if (!chunk) return fail(`no chunk ${d.chunk}`);
  const round = chunk.rounds?.find((r) => r.round === d.round);
  if (!round) return fail(`chunk ${d.chunk} has no review round ${d.round}`);
  if (round.decisions.some((x) => x.id === d.id)) return { ok: false, duplicate: true, reason: "already recorded" };
  if (d.nonce !== round.nonce) return fail(`review token does not match chunk ${d.chunk} round ${d.round}`);
  if (d.base !== round.base || d.tip !== round.tip)
    return fail(`decision was made on ${shortSha(d.base)}..${shortSha(d.tip)}, round ${d.round} is ${shortSha(round.base)}..${shortSha(round.tip)}`);
  if (round !== latestRound(chunk)) return fail(`round ${d.round} is no longer current (latest is round ${latestRound(chunk).round}); review the latest revision`);
  if (round.status !== "open") return fail(`round ${d.round} is already ${round.status.replace("_", " ")}`);
  if (chunk.tip !== round.tip) return fail(`chunk ${d.chunk} moved to ${shortSha(chunk.tip)} after this review opened`);
  if (facts.head !== round.tip) return fail(`HEAD is ${shortSha(facts.head)}, not the reviewed ${shortSha(round.tip)}: the code changed since this review opened`);
  return { ok: true, chunk, round, stale: false };
}

const FINDING_TAG = /^\s*\[(F\d+)\]/;

/** Pair reviewer findings with the person's replies to them in Hunk. */
export function findingResponses(round, d) {
  const findingByNote = new Map();
  for (const n of d.agentNotes ?? []) {
    const m = String(n.summary ?? "").match(FINDING_TAG);
    if (m) findingByNote.set(n.id, m[1]);
  }
  const replies = new Map();
  for (const n of d.notes ?? []) {
    const f = n.parentId ? findingByNote.get(n.parentId) : null;
    if (f) replies.set(f, [...(replies.get(f) ?? []), n.body]);
  }
  return (round.findings ?? []).map((f) => ({
    finding: f.id,
    severity: f.severity ?? null,
    summary: f.summary,
    reply: replies.has(f.id) ? replies.get(f.id).join("\n") : null,
  }));
}

/**
 * Validate and record one decision. Mutates state; returns what happened.
 * The person's approval is the only decision (notes go to the reviewer).
 */
export function applyDecision(state, d, facts, { notesFile } = {}) {
  const v = validateDecision(state, d, facts);
  const at = nowIso();
  if (!v.ok) {
    if (v.duplicate) return { accepted: false, duplicate: true, reason: v.reason };
    // Keep a trace of rejected decisions on the round they named, when it exists.
    const chunk = state.chunks.find((c) => c.n === d.chunk);
    const round = chunk?.rounds?.find((r) => r.round === d.round);
    if (round && !round.decisions.some((x) => x.id === d.id))
      round.decisions.push({ id: d.id, kind: d.decision, source: d.source ?? "hunk", at, accepted: false, reason: v.reason, notesFile: notesFile ?? null });
    return { accepted: false, reason: v.reason, chunk: d.chunk, round: d.round, decision: d.decision };
  }
  const { chunk, round } = v;
  const responses = findingResponses(round, d);
  const record = {
    id: d.id,
    kind: d.decision,
    source: d.source ?? "hunk",
    at,
    accepted: true,
    stale: v.stale || undefined,
    hunkSession: d.hunkSession ?? null,
    noteCount: (d.notes ?? []).length,
    notesFile: notesFile ?? null,
    findingResponses: responses,
  };
  // Approval overrides reviewer findings; keep the person's reply when there is one.
  record.overrides = responses.map((r) => ({ finding: r.finding, reply: r.reply }));
  round.status = "approved";
  chunk.status = "approved";
  chunk.approvedAt = at;
  round.decisions.push(record);
  return {
    accepted: true,
    decision: d.decision,
    chunk: chunk.n,
    round: round.round,
    stale: !!v.stale,
    noteCount: record.noteCount,
    responses,
  };
}

/** Human-readable record of what the person said in Hunk for one decision. */
export function decisionMarkdown(state, d, outcome) {
  const lines = [];
  const what = { approve: "Approved" }[d.decision] ?? d.decision;
  lines.push(`# Chunk ${d.chunk} · round ${d.round} · ${what}`);
  lines.push("");
  lines.push(`- Feature: ${state.feature.id}`);
  lines.push(`- Revision: ${d.base}..${d.tip}`);
  lines.push(`- Source: ${d.source ?? "hunk"}${d.hunkSession ? ` (Hunk session ${d.hunkSession})` : ""}`);
  lines.push(`- Recorded: ${outcome.accepted ? "yes" : `NO — ${outcome.reason}`}`);
  if (d.decision === "approve" && (d.notes ?? []).length) lines.push("- Notes on an approval are non-blocking: do not launch fixes for them.");
  if (d.summary) {
    lines.push("", "## Summary from the reviewer (person)", "", d.summary);
  }
  const notes = d.notes ?? [];
  if (notes.length) {
    lines.push("", "## Notes", "");
    const agentById = new Map((d.agentNotes ?? []).map((n) => [n.id, n]));
    notes.forEach((n, i) => {
      const where = [n.newRange && `new:${fmtRange(n.newRange)}`, n.oldRange && `old:${fmtRange(n.oldRange)}`].filter(Boolean).join(" ");
      lines.push(`${i + 1}. [${n.id}] ${n.path}${where ? ` ${where}` : ""}`);
      if (n.parentId) {
        const parent = agentById.get(n.parentId);
        lines.push(`   reply to [${n.parentId}]${parent ? ` (${parent.author ?? "agent"}): "${oneLine(parent.summary)}"` : ""}`);
      }
      for (const l of String(n.body).split("\n")) lines.push(`   ${l}`);
    });
  }
  if (outcome.accepted && outcome.responses?.length) {
    lines.push("", "## Reviewer findings and your responses", "");
    for (const r of outcome.responses) lines.push(`- ${r.finding}${r.severity ? ` (${r.severity})` : ""}: ${oneLine(r.summary)} → ${r.reply ? `reply: "${oneLine(r.reply)}"` : "no reply"}`);
    if (d.decision === "approve") lines.push("", "Approval overrides every finding above; replies are kept as reviewer feedback.");
  }
  return lines.join("\n") + "\n";
}

const fmtRange = (r) => (r[0] === r[1] ? `${r[0]}` : `${r[0]}-${r[1]}`);
const oneLine = (s) => String(s ?? "").replace(/\s+/g, " ").slice(0, 200);

/**
 * Turn reviewer findings into one Hunk `comment apply` batch. Findings whose
 * line is not in the reviewed diff are anchored to the file's first hunk (or
 * the first file) with their real location in the text, so the batch never
 * fails validation.
 * @param review hunk session review JSON: { files: [{ path, hunks: [{ index, oldRange, newRange }] }] }
 */
export function findingsToComments(findings, review, author) {
  const files = review?.files ?? [];
  const inRange = (r, line) => r && line >= r[0] && line <= r[1];
  return findings.map((f) => {
    const tag = `[${f.id}]${f.severity ? ` (${f.severity})` : ""} `;
    const base = { summary: `${tag}${f.summary}`, ...(f.rationale ? { rationale: f.rationale } : {}), author };
    const file = files.find((x) => x.path === f.file);
    const side = f.side === "old" ? "old" : "new";
    if (file && f.line && file.hunks.some((h) => inRange(side === "old" ? h.oldRange : h.newRange, f.line)))
      return { ...base, filePath: f.file, [side === "old" ? "oldLine" : "newLine"]: f.line };
    const where = f.file ? ` (at ${f.file}${f.line ? `:${f.line}` : ""}, outside the changed lines)` : " (general)";
    const target = file ?? files[0];
    if (!target) return null;
    return { ...base, summary: `${tag}${f.summary}${where}`, filePath: target.path, hunk: (target.hunks[0]?.index ?? 0) + 1 };
  }).filter(Boolean);
}

/** The person's Hunk notes as a readable file (no decision). */
export function notesMarkdown(state, d) {
  const lines = [`# Chunk ${d.chunk} · round ${d.round} · notes from the person in Hunk`, ""];
  lines.push(`- Feature: ${state.feature.id}`);
  lines.push(`- Revision: ${d.base}..${d.tip}`);
  lines.push(`- Hunk session: ${d.hunkSession ?? "unknown"} (answer in place: feature reply <note id> --text "...")`);
  if (d.summary) lines.push("", "## Summary from the person", "", d.summary);
  const agentById = new Map((d.agentNotes ?? []).map((n) => [n.id, n]));
  lines.push("", "## Notes", "");
  (d.notes ?? []).forEach((n, i) => {
    const where = [n.newRange && `new:${fmtRange(n.newRange)}`, n.oldRange && `old:${fmtRange(n.oldRange)}`].filter(Boolean).join(" ");
    lines.push(`${i + 1}. [${n.id}] ${n.path}${where ? ` ${where}` : ""}`);
    if (n.parentId) {
      const parent = agentById.get(n.parentId);
      lines.push(`   reply to [${n.parentId}]${parent ? ` (${parent.author ?? "agent"}): "${oneLine(parent.summary)}"` : ""}`);
    }
    for (const l of String(n.body).split("\n")) lines.push(`   ${l}`);
  });
  return lines.join("\n") + "\n";
}
