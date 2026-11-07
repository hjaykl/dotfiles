// .feature/state.json: exact configuration and bookkeeping. The overseer (via
// this library: the `feature` CLI and the pi extension) is its only writer.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import * as g from "./git.js";
import { applyDecision, decisionMarkdown, latestRound, notesMarkdown, openRound } from "./review.js";

/** Decision kinds older Hunk sessions still send; in v2 they are just notes. */
export const LEGACY_NOTES = ["comments", "request_changes"];
import { FeatureError, nowIso, readJson, shortSha, writeFileAtomic, writeJsonAtomic } from "./util.js";

export const STATE_VERSION = 1;

export function paths(wt) {
  const dir = join(wt, ".feature");
  return {
    wt,
    dir,
    state: join(dir, "state.json"),
    lock: join(dir, ".lock"),
    plan: join(wt, ".plan.md"),
    inbox: join(dir, "inbox"),
    processed: join(dir, "inbox", "processed"),
    reviews: join(dir, "reviews"),
    reports: join(dir, "reports"),
    briefs: join(dir, "briefs"),
    research: join(dir, "research.md"),
    planDraft: join(dir, "plan-draft.md"),
    feedbackLog: join(dir, "reviewer-feedback.jsonl"),
  };
}

export const hasState = (wt) => existsSync(paths(wt).state);

export function loadState(wt) {
  const p = paths(wt);
  if (!existsSync(p.state)) throw new FeatureError(`no feature here: ${p.state} does not exist`, "no_state");
  const s = readJson(p.state);
  if (s.version !== STATE_VERSION) throw new FeatureError(`unsupported state version ${s.version}`);
  return s;
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Serialise read-modify-write between the CLI and the pi extension. */
export function withLock(wt, fn) {
  const p = paths(wt);
  mkdirSync(p.dir, { recursive: true });
  const deadline = Date.now() + 10_000;
  for (;;) {
    try {
      mkdirSync(p.lock);
      break;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      try {
        if (Date.now() - statSync(p.lock).mtimeMs > 30_000) rmSync(p.lock, { recursive: true, force: true });
      } catch {}
      if (Date.now() > deadline) throw new FeatureError(`state is locked (${p.lock}); remove it if no feature command is running`, "locked");
      sleepMs(50);
    }
  }
  try {
    return fn();
  } finally {
    rmSync(p.lock, { recursive: true, force: true });
  }
}

/** Load, mutate, save under the lock. fn returns the command's result. */
export function updateState(wt, fn) {
  return withLock(wt, () => {
    const state = loadState(wt);
    const result = fn(state);
    state.rev = (state.rev ?? 0) + 1;
    state.updatedAt = nowIso();
    writeJsonAtomic(paths(wt).state, state);
    return result;
  });
}

/**
 * Start a feature in this worktree. Never overwrites: an existing state means
 * resume, decided by the person.
 */
export function initFeature(wt, { feature, config, overseer }) {
  const p = paths(wt);
  return withLock(wt, () => {
    if (existsSync(p.state)) throw new FeatureError(`a feature already exists here (${p.state}); resume it instead`, "exists");
    const startCommit = g.head(wt);
    const dirty = g.dirtyPaths(wt);
    const state = {
      version: STATE_VERSION,
      rev: 1,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      feature: {
        id: feature.id,
        ticket: feature.ticket ?? null,
        url: feature.url ?? null,
        title: feature.title ?? feature.ticket ?? feature.id,
        task: feature.task ?? null,
        worktree: wt,
        branch: g.branch(wt),
        startCommit,
        dirtyAtStart: dirty,
      },
      config,
      overseer: overseer ?? null,
      phase: "configured",
      phases: [{ phase: "configured", at: nowIso() }],
      agents: {},
      chunks: [],
      blockers: [],
      pr: null,
    };
    for (const d of [p.inbox, p.processed, p.reviews, p.reports, p.briefs]) mkdirSync(d, { recursive: true });
    writeJsonAtomic(p.state, state);
    return state;
  });
}

export const PHASES = ["configured", "research", "planning", "implementing", "finishing", "done"];

export function setPhase(state, phase, note) {
  if (!PHASES.includes(phase)) throw new FeatureError(`unknown phase ${phase} (${PHASES.join(", ")})`);
  state.phase = phase;
  state.phases.push({ phase, at: nowIso(), ...(note ? { note } : {}) });
}

export function getChunk(state, n) {
  const c = state.chunks.find((x) => x.n === Number(n));
  if (!c) throw new FeatureError(`no chunk ${n}`);
  return c;
}

export function addChunk(state, title, acceptance) {
  const n = state.chunks.length + 1;
  const chunk = { n, title, acceptance: acceptance ?? null, status: "todo", base: null, tip: null, implementer: null, reviewer: null, revisions: [], reviews: [], rounds: [] };
  state.chunks.push(chunk);
  return chunk;
}

/** Where chunk n must start: the previous chunk's approved tip, or the feature's start commit. */
export function expectedBase(state, n) {
  const prev = state.chunks.filter((c) => c.n < n);
  if (prev.some((c) => c.status !== "approved")) {
    const open = prev.find((c) => c.status !== "approved");
    throw new FeatureError(`chunk ${open.n} is ${open.status}, not approved: chunks run in order`);
  }
  return prev.length ? prev[prev.length - 1].tip : state.feature.startCommit;
}

export function startChunk(state, n, { head, dirty, allowDirty }) {
  const chunk = getChunk(state, n);
  if (chunk.status !== "todo") throw new FeatureError(`chunk ${n} is already ${chunk.status}`);
  const base = expectedBase(state, chunk.n);
  if (head !== base)
    throw new FeatureError(`HEAD is ${shortSha(head)} but chunk ${n} should start at ${shortSha(base)}: reconcile with the person before starting`, "head_mismatch");
  if (dirty.length && !allowDirty)
    throw new FeatureError(`worktree has uncommitted changes (${dirty.slice(0, 5).join(", ")}${dirty.length > 5 ? ", …" : ""}): ask the person how they relate before implementing`, "dirty");
  chunk.base = base;
  chunk.status = "in_progress";
  chunk.startedAt = nowIso();
  if (dirty.length) chunk.dirtyAtStart = { paths: dirty, allowed: allowDirty };
  return chunk;
}

/** Implementer reported a commit (first or after fixes): record the chunk's new revision. */
export function recordCommit(state, n, { head, commits }) {
  const chunk = getChunk(state, n);
  if (!["in_progress", "committed", "changes_requested", "in_review"].includes(chunk.status))
    throw new FeatureError(`chunk ${n} is ${chunk.status}; nothing to record`);
  if (head === chunk.base) throw new FeatureError(`chunk ${n} has no commits on top of ${shortSha(chunk.base)}`);
  if (!commits.length) throw new FeatureError(`HEAD ${shortSha(head)} does not descend from chunk ${n}'s base ${shortSha(chunk.base)}`);
  if (chunk.tip === head && chunk.status !== "in_progress") return { chunk, unchanged: true };
  chunk.tip = head;
  chunk.revisions.push({ tip: head, at: nowIso(), commits });
  // A new revision supersedes any open round: it showed different code.
  for (const r of chunk.rounds) if (r.status === "open") r.status = "superseded";
  chunk.status = "committed";
  return { chunk, unchanged: false };
}

/** Reviewer findings for an exact revision. */
export function recordReview(state, n, { report, findings }) {
  const chunk = getChunk(state, n);
  if (!chunk.tip) throw new FeatureError(`chunk ${n} has no revision to review`);
  chunk.reviews.push({ base: chunk.base, tip: chunk.tip, report, findings, at: nowIso() });
  return chunk;
}

export function startRound(state, n) {
  const chunk = getChunk(state, n);
  if (!["committed", "in_review", "changes_requested"].includes(chunk.status))
    throw new FeatureError(`chunk ${n} is ${chunk.status}: record the implementer's commit first`);
  if (chunk.status === "changes_requested" && latestRound(chunk)?.tip === chunk.tip)
    throw new FeatureError(`chunk ${n}: changes were requested on ${shortSha(chunk.tip)} and no new revision is recorded`);
  return openRound(chunk, { requireReview: !!state.config.roles.reviewer?.enabled });
}

export function tokenPath(wt, n, round) {
  return join(paths(wt).reviews, `c${n}-r${round}.token.json`);
}

/** The binding the Hunk extension carries; decisions must echo it back. */
export function reviewToken(state, chunk, round) {
  const p = paths(state.feature.worktree);
  return {
    type: "feature-review",
    featureId: state.feature.id,
    title: state.feature.title,
    chunk: chunk.n,
    chunkTitle: chunk.title,
    round: round.round,
    base: round.base,
    tip: round.tip,
    nonce: round.nonce,
    worktree: state.feature.worktree,
    inbox: p.inbox,
    sessionFile: join(p.reviews, `c${chunk.n}-r${round.round}.session`),
    reviewer: chunk.reviewer,
    notesTo: chunk.reviewer ?? chunk.implementer,
    overseer: state.overseer?.terminal ?? null,
    findings: round.findings.map((f) => f.id),
  };
}

/** Decision files Hunk (or a /feature command) left in the inbox, oldest first. */
export function inboxFiles(wt) {
  const p = paths(wt);
  if (!existsSync(p.inbox)) return [];
  return readdirSync(p.inbox)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => join(p.inbox, f));
}

/**
 * Process every inbox decision: validate against state + HEAD, record it,
 * write a readable notes file, move the raw file to processed/.
 * @returns outcomes, one per file
 */
export function ingestInbox(wt, { head = () => g.head(wt) } = {}) {
  const files = inboxFiles(wt);
  if (!files.length) return [];
  const p = paths(wt);
  const outcomes = [];
  updateState(wt, (state) => {
    for (const file of files) {
      let d;
      try {
        d = JSON.parse(readFileSync(file, "utf8"));
      } catch (e) {
        outcomes.push({ file, accepted: false, reason: `unreadable decision file: ${e.message}` });
        moveTo(file, join(p.processed, `bad-${Date.now()}-${basename(file)}`));
        continue;
      }
      const tag = `c${d.chunk}-r${d.round}-${d.decision}-${String(d.id).slice(0, 8)}`;
      const notesFile = join(p.reviews, `${tag}.md`);
      // Notes from an older Hunk session (its pi-send predates v2, where p goes
      // to the reviewer): not a decision. Keep them readable and hand them to
      // the chunk's reviewer like a v2 `p` would.
      if (LEGACY_NOTES.includes(d.decision)) {
        const chunk = state.chunks.find((c) => c.n === d.chunk);
        writeFileAtomic(notesFile, notesMarkdown(state, d));
        moveTo(file, join(p.processed, `${basename(file)}`));
        outcomes.push({
          file,
          legacyNotes: true,
          decision: d.decision,
          chunk: d.chunk,
          round: d.round,
          noteCount: (d.notes ?? []).length,
          notesFile,
          notesTo: chunk ? chunk.reviewer ?? chunk.implementer : null,
          hunkSession: d.hunkSession ?? null,
        });
        continue;
      }
      const outcome = applyDecision(state, d, { head: head() }, { notesFile });
      if (!outcome.duplicate) {
        writeFileAtomic(notesFile, decisionMarkdown(state, d, outcome));
        if (outcome.accepted && outcome.responses?.length) appendFeedback(p.feedbackLog, state, d, outcome);
      }
      moveTo(file, join(p.processed, `${basename(file)}`));
      outcomes.push({ file, ...outcome, notesFile: outcome.duplicate ? null : notesFile });
    }
  });
  return outcomes;
}

function appendFeedback(log, state, d, outcome) {
  const lines = outcome.responses.map((r) =>
    JSON.stringify({ at: nowIso(), feature: state.feature.id, chunk: d.chunk, round: d.round, decision: d.decision, ...r }),
  );
  const prev = existsSync(log) ? readFileSync(log, "utf8") : "";
  writeFileAtomic(log, prev + lines.join("\n") + "\n");
}

const basename = (f) => f.split("/").pop();
function moveTo(from, to) {
  mkdirSync(join(to, ".."), { recursive: true });
  renameSync(from, to);
}

/** Write a decision into the inbox (Hunk does the same from its extension). */
export function writeInbox(wt, decision) {
  const p = paths(wt);
  const file = join(p.inbox, `${Date.now()}-${String(decision.id).slice(0, 12)}.json`);
  writeFileAtomic(file, JSON.stringify(decision, null, 2) + "\n");
  return file;
}

/**
 * Only the overseer processes the inbox and acts on Hunk decisions. Role
 * agents run pi in the same worktree (with the same extension), so they must
 * not: their terminal is not the recorded overseer terminal.
 */
export function isOverseerTerminal(state, terminal) {
  if (!terminal || !state.overseer?.terminal) return false;
  if (Object.values(state.agents ?? {}).some((a) => a.address === terminal)) return false;
  return state.overseer.terminal === terminal;
}

/** The chunk whose review the person is deciding on now (latest open round). */
export function currentReview(state) {
  for (const c of state.chunks) {
    const r = latestRound(c);
    if (r && r.status === "open") return { chunk: c, round: r };
  }
  return null;
}
