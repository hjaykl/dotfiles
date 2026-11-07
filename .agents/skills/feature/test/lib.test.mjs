// node --test test/   — library rules, including the negative controls.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import * as cfg from "../lib/config.js";
import * as names from "../lib/names.js";
import * as picker from "../lib/picker.js";
import * as review from "../lib/review.js";
import * as st from "../lib/state.js";
import * as status from "../lib/status.js";
import { spawnArgv } from "../lib/hc.js";

const available = [
  { provider: "github-copilot", id: "claude-opus-5.5", thinkingLevels: ["off", "low", "medium", "high", "xhigh"] },
  { provider: "github-copilot", id: "gpt-6.1-sol", thinkingLevels: ["off", "minimal", "low", "medium", "high"] },
  { provider: "litellm", id: "GLOBAL claude-sonnet-5-5", thinkingLevels: ["off", "low", "medium", "high"] },
];
const current = { provider: "github-copilot", model: "claude-opus-5.5", thinking: "high" };

function config(preset = "full") {
  return cfg.seedConfig({ defaults: cfg.loadDefaults("/nonexistent"), current, proposal: { preset } });
}

// ---------------------------------------------------------------- names
test("tickets: bare id and Linear URL are tickets; prose is a task", () => {
  assert.deepEqual(names.parseTicket("FLE-2172"), { ticket: "FLE-2172", rest: "" });
  const u = names.parseTicket("https://linear.app/electroverse/issue/FLE-2172/port-the-fleet please");
  assert.equal(u.ticket, "FLE-2172");
  assert.equal(u.rest, "please");
  assert.equal(names.parseTicket("port the sidebar to the app router"), null);
  assert.equal(names.parseTicket(""), null);
});

test("agent names: unique, valid hc names, max 32, include the feature id", () => {
  const n = names.agentName("fle-2172", "implementer", 3);
  assert.equal(n, "fle-2172-impl-3");
  assert.equal(names.agentName("fle-2172", "implementer", 3, new Set([n])), "fle-2172-impl-3-2");
  const long = names.agentName("a-very-long-feature-identifier-text", "researcher", null);
  assert.ok(long.length <= 32 && names.isValidHcName(long), long);
  assert.ok(long.endsWith("-research"));
  assert.throws(() => names.agentName("x", "tester", 1), /unknown role/);
  const id = names.featureIdFor({ task: "Port the sidebar layout!" }, "ab12");
  assert.equal(id, "port-the-sideb-ab12");
});

// ---------------------------------------------------------------- config
test("presets: tiny/medium/full role sets, no tester", () => {
  assert.deepEqual(cfg.enabledRoles(config("tiny")), ["implementer"]);
  assert.deepEqual(cfg.enabledRoles(config("medium")), ["planner", "implementer", "reviewer"]);
  assert.deepEqual(cfg.enabledRoles(config("full")), ["researcher", "planner", "implementer", "reviewer"]);
  assert.ok(!("tester" in config().roles));
});

test("validation: ok when every model is available with a supported thinking level", () => {
  assert.deepEqual(cfg.validateConfig(config(), { available }), { ok: true, errors: [] });
});

test("validation NEGATIVE: unavailable model is refused", () => {
  const c = picker.setModel(config(), "reviewer", { provider: "openai", id: "gpt-x", thinkingLevels: ["high"] });
  const v = cfg.validateConfig(c, { available });
  assert.equal(v.ok, false);
  assert.match(v.errors.join(), /reviewer: openai\/gpt-x is not available/);
});

test("validation NEGATIVE: unsupported thinking level is refused", () => {
  const c = picker.setThinking(config(), "planner", "max");
  const v = cfg.validateConfig(c, { available });
  assert.equal(v.ok, false);
  assert.match(v.errors.join(), /does not support thinking "max"/);
});

test("validation NEGATIVE: model outside scoped models is refused; scoped list narrows the picker", () => {
  const scoped = [{ provider: "github-copilot", id: "gpt-6.1-sol" }];
  const v = cfg.validateConfig(config(), { available, scoped });
  assert.equal(v.ok, false);
  assert.match(v.errors.join(), /outside this session's scoped models/);
  assert.deepEqual(picker.modelMenu(available, scoped, null).map((i) => i.id), ["github-copilot/gpt-6.1-sol"]);
});

test("validation NEGATIVE: implementer cannot be disabled", () => {
  assert.throws(() => picker.toggleRole(config(), "implementer"), /required/);
});

test("picker: toggling a role makes the preset custom; choosing a preset resets roles", () => {
  let c = picker.toggleRole(config("full"), "researcher");
  assert.equal(c.preset, "medium");
  c = picker.toggleRole(c, "reviewer");
  assert.equal(c.preset, "custom");
  c = picker.applyPreset(c, "tiny");
  assert.deepEqual(cfg.enabledRoles(c), ["implementer"]);
  assert.equal(c.roles.reviewer.model, "claude-opus-5.5", "model choice kept while disabled");
});

test("picker: model change clamps thinking to what the model supports", () => {
  const c = picker.setThinking(config(), "implementer", "xhigh");
  const d = picker.setModel(c, "implementer", available[2]);
  assert.equal(d.roles.implementer.thinking, "high");
  assert.equal(picker.clampThinking(["off"], "high"), "off");
});

test("picker: menu has no parallelism/tester/archive/linear controls; Hunk always on", () => {
  const labels = picker.mainMenu(config(), { save: false }).map((i) => i.label).join("\n");
  assert.doesNotMatch(labels, /parallel|tester|archive|linear/i);
  assert.match(labels, /Hunk review\s+always on/);
  assert.match(labels, /Reviewer standards: AGENTS\.md/);
});

test("defaults: save then load round-trips models, preset and standards", () => {
  const dir = mkdtempSync(join(tmpdir(), "fw-def-"));
  const p = join(dir, "defaults.json");
  writeFileSync(p, JSON.stringify({ note: "kept" }));
  const c = picker.setStandards(picker.setModel(config("medium"), "planner", available[1]), "AGENTS.md, STANDARDS.md");
  cfg.saveDefaults(p, c);
  const d = cfg.loadDefaults(p);
  assert.equal(d.preset, "medium");
  assert.equal(d.roles.planner.model, "gpt-6.1-sol");
  assert.deepEqual(d.standards, ["AGENTS.md", "STANDARDS.md"]);
  assert.equal(JSON.parse(readFileSync(p, "utf8")).note, "kept");
});

// ---------------------------------------------------------------- state + review
function repo() {
  const dir = mkdtempSync(join(tmpdir(), "fw-repo-"));
  const git = (...a) => execFileSync("git", ["-C", dir, ...a], { encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  writeFileSync(join(dir, ".gitignore"), ".plan.md\n.feature/\n");
  writeFileSync(join(dir, "a.txt"), "1\n");
  git("add", ".");
  git("commit", "-qm", "init");
  const commit = (file, text, msg, amend = false) => {
    writeFileSync(join(dir, file), text);
    git("add", ".");
    git("commit", "-q", ...(amend ? ["--amend", "--no-edit"] : ["-m", msg]));
    return git("rev-parse", "HEAD");
  };
  return { dir, git, commit, head: () => git("rev-parse", "HEAD") };
}

function started(preset = "medium") {
  const r = repo();
  const c = cfg.normalizeConfig(config(preset));
  st.initFeature(r.dir, { feature: { id: "fle-1", ticket: "FLE-1", title: "T" }, config: c, overseer: { terminal: "t1", space: "sp1" } });
  return r;
}

test("init NEGATIVE: an existing feature is never overwritten", () => {
  const r = started();
  const before = readFileSync(st.paths(r.dir).state, "utf8");
  assert.throws(() => st.initFeature(r.dir, { feature: { id: "x" }, config: {}, overseer: null }), /already exists/);
  assert.equal(readFileSync(st.paths(r.dir).state, "utf8"), before);
});

test("init records start commit and the dirty files present at start", () => {
  const r = repo();
  writeFileSync(join(r.dir, "wip.txt"), "x");
  const s = st.initFeature(r.dir, { feature: { id: "f" }, config: cfg.normalizeConfig(config()), overseer: null });
  assert.equal(s.feature.startCommit, r.head());
  assert.deepEqual(s.feature.dirtyAtStart, ["wip.txt"]);
});

test("chunk start NEGATIVE: dirty tree and wrong HEAD are refused; order enforced", () => {
  const r = started();
  st.updateState(r.dir, (s) => {
    st.addChunk(s, "one");
    st.addChunk(s, "two");
  });
  writeFileSync(join(r.dir, "wip.txt"), "x");
  assert.throws(() => st.updateState(r.dir, (s) => st.startChunk(s, 1, { head: r.head(), dirty: ["wip.txt"], allowDirty: false })), /uncommitted/);
  assert.throws(() => st.updateState(r.dir, (s) => st.startChunk(s, 1, { head: "deadbeef", dirty: [], allowDirty: false })), /reconcile/);
  assert.throws(() => st.updateState(r.dir, (s) => st.startChunk(s, 2, { head: r.head(), dirty: [], allowDirty: false })), /chunk 1 is todo/);
  const c = st.updateState(r.dir, (s) => st.startChunk(s, 1, { head: r.head(), dirty: ["wip.txt"], allowDirty: true }));
  assert.deepEqual(c.dirtyAtStart, { paths: ["wip.txt"], allowed: true });
});

/** Drive one chunk to an open round, returning helpers. */
function toRound(r, { reviewer = true } = {}) {
  st.updateState(r.dir, (s) => {
    st.addChunk(s, "one");
    st.startChunk(s, 1, { head: r.head(), dirty: [], allowDirty: false });
  });
  const base = r.head();
  const tip = r.commit("a.txt", "2\n", "chunk 1");
  st.updateState(r.dir, (s) => st.recordCommit(s, 1, { head: tip, commits: [{ sha: tip, subject: "chunk 1" }] }));
  if (reviewer)
    st.updateState(r.dir, (s) =>
      st.recordReview(s, 1, { report: "rev.md", findings: [{ id: "F1", severity: "major", file: "a.txt", line: 1, summary: "bad" }, { id: "F2", summary: "naming" }] }),
    );
  const round = st.updateState(r.dir, (s) => st.startRound(s, 1));
  return { base, tip, round };
}

const decision = (state, round, kind, extra = {}) => ({
  id: Math.random().toString(16).slice(2),
  decision: kind,
  featureId: state.feature.id,
  chunk: 1,
  round: round.round,
  base: round.base,
  tip: round.tip,
  nonce: round.nonce,
  notes: [],
  agentNotes: [],
  ...extra,
});

test("review open NEGATIVE: needs reviewer findings for the exact revision when the reviewer is enabled", () => {
  const r = started("medium");
  st.updateState(r.dir, (s) => {
    st.addChunk(s, "one");
    st.startChunk(s, 1, { head: r.head(), dirty: [], allowDirty: false });
  });
  const tip = r.commit("a.txt", "2\n", "c1");
  st.updateState(r.dir, (s) => st.recordCommit(s, 1, { head: tip, commits: [{ sha: tip }] }));
  assert.throws(() => st.updateState(r.dir, (s) => st.startRound(s, 1)), /no reviewer findings/);
  // tiny preset: no reviewer, Hunk directly.
  const t = started("tiny");
  const { round } = toRound(t, { reviewer: false });
  assert.equal(round.round, 1);
});

test("decision NEGATIVE: wrong nonce, wrong feature, wrong revision are refused", () => {
  const r = started();
  const { round } = toRound(r);
  const s = st.loadState(r.dir);
  const facts = { head: r.head() };
  assert.match(review.validateDecision(s, decision(s, round, "approve", { nonce: "x" }), facts).reason, /token does not match/);
  assert.match(review.validateDecision(s, decision(s, round, "approve", { featureId: "other" }), facts).reason, /feature other/);
  assert.match(review.validateDecision(s, decision(s, round, "approve", { tip: "f".repeat(40) }), facts).reason, /decision was made on/);
});

test("decision NEGATIVE: stale approval after the code moved is refused and nothing advances", () => {
  const r = started();
  const { round } = toRound(r);
  r.commit("a.txt", "3\n", "sneaky extra commit");
  const s = st.loadState(r.dir);
  const out = review.applyDecision(s, decision(s, round, "approve"), { head: r.head() });
  assert.equal(out.accepted, false);
  assert.match(out.reason, /code changed since this review opened/);
  assert.equal(s.chunks[0].status, "in_review");
  assert.equal(s.chunks[0].rounds[0].decisions[0].accepted, false, "rejection kept as evidence");
});

test("v2: only approval is a decision; request_changes / comments from old clients are refused", () => {
  const r = started();
  const { round } = toRound(r);
  const s = st.loadState(r.dir);
  for (const kind of ["request_changes", "comments"]) {
    const out = review.applyDecision(s, decision(s, round, kind), { head: r.head() });
    assert.equal(out.accepted, false);
    assert.match(out.reason, /unknown decision/);
  }
  assert.equal(s.chunks[0].status, "in_review");
});

test("approval overrides reviewer findings; replies are kept, no rationale invented", () => {
  const r = started();
  const { round } = toRound(r);
  const s = st.loadState(r.dir);
  const d = decision(s, round, "approve", {
    agentNotes: [{ id: "a1", summary: "[F1] (major) bad" }, { id: "a2", summary: "[F2] naming" }],
    notes: [{ id: "u1", parentId: "a2", path: "a.txt", body: "not useful: matches API" }],
  });
  const out = review.applyDecision(s, d, { head: r.head() });
  assert.equal(out.accepted, true);
  assert.equal(s.chunks[0].status, "approved");
  const rec = s.chunks[0].rounds[0].decisions[0];
  assert.deepEqual(rec.overrides, [{ finding: "F1", reply: null }, { finding: "F2", reply: "not useful: matches API" }]);
});

test("decision NEGATIVE: a second approval of a decided round is refused; duplicate ids are idempotent", () => {
  const r = started();
  const { round } = toRound(r);
  const s = st.loadState(r.dir);
  const d = decision(s, round, "approve");
  assert.equal(review.applyDecision(s, d, { head: r.head() }).accepted, true);
  assert.equal(review.applyDecision(s, d, { head: r.head() }).duplicate, true);
  const again = review.applyDecision(s, decision(s, round, "approve"), { head: r.head() });
  assert.equal(again.accepted, false);
  assert.match(again.reason, /already approved/);
});

test("fixes: amend + fix commit supersede the open round; new round covers base..new tip; old round approval refused", () => {
  const r = started();
  const { base } = toRound(r);
  const amended = r.commit("a.txt", "2b\n", null, true);
  const fix = r.commit("b.txt", "fix\n", "separate fix");
  st.updateState(r.dir, (s) => st.recordCommit(s, 1, { head: fix, commits: [{ sha: amended }, { sha: fix }] }));
  let s = st.loadState(r.dir);
  assert.equal(s.chunks[0].rounds[0].status, "superseded");
  assert.throws(() => st.updateState(r.dir, (x) => st.startRound(x, 1)), /no reviewer findings/, "reviewer must re-review the new revision");
  st.updateState(r.dir, (x) => st.recordReview(x, 1, { report: "rev2.md", findings: [] }));
  const r2 = st.updateState(r.dir, (x) => st.startRound(x, 1));
  assert.equal(r2.round, 2);
  assert.equal(r2.base, base, "whole chunk: same base");
  assert.equal(r2.tip, fix);
  s = st.loadState(r.dir);
  assert.equal(review.applyDecision(s, decision(s, s.chunks[0].rounds[0], "approve"), { head: r.head() }).accepted, false);
  assert.equal(review.applyDecision(s, decision(s, s.chunks[0].rounds[1], "approve"), { head: r.head() }).accepted, true);
  assert.equal(s.chunks[0].revisions.length, 2, "both revisions kept as evidence");
});

test("a new commit supersedes the open round", () => {
  const r = started();
  const { round } = toRound(r);
  const tip2 = r.commit("a.txt", "4\n", "more");
  st.updateState(r.dir, (s) => st.recordCommit(s, 1, { head: tip2, commits: [{ sha: tip2 }] }));
  const s = st.loadState(r.dir);
  assert.equal(s.chunks[0].rounds[0].status, "superseded");
  const out = review.applyDecision(s, decision(s, round, "approve"), { head: r.head() });
  assert.equal(out.accepted, false);
});

test("next chunk starts at the approved tip", () => {
  const r = started();
  const { round, tip } = toRound(r);
  st.updateState(r.dir, (s) => {
    review.applyDecision(s, decision(s, round, "approve"), { head: r.head() });
    st.addChunk(s, "two");
  });
  assert.equal(st.expectedBase(st.loadState(r.dir), 2), tip);
});

test("inbox: ingest records, writes a notes file, moves the raw file, logs reviewer feedback", () => {
  const r = started();
  const { round } = toRound(r);
  const s = st.loadState(r.dir);
  st.writeInbox(r.dir, decision(s, round, "approve", { agentNotes: [{ id: "a1", summary: "[F1] bad" }], notes: [{ id: "u1", parentId: "a1", path: "a.txt", body: "accepted tradeoff: perf" }] }));
  const outs = st.ingestInbox(r.dir);
  assert.equal(outs.length, 1);
  assert.equal(outs[0].accepted, true);
  assert.ok(existsSync(outs[0].notesFile));
  assert.match(readFileSync(outs[0].notesFile, "utf8"), /accepted tradeoff: perf/);
  assert.equal(st.inboxFiles(r.dir).length, 0);
  assert.equal(readdirSync(st.paths(r.dir).processed).length, 1);
  const log = readFileSync(st.paths(r.dir).feedbackLog, "utf8").trim().split("\n").map(JSON.parse);
  assert.equal(log.find((l) => l.finding === "F1").reply, "accepted tradeoff: perf");
  assert.equal(st.loadState(r.dir).chunks[0].status, "approved");
});

test("findings outside the diff are anchored to a hunk with their real location", () => {
  const rv = { files: [{ path: "a.txt", hunks: [{ index: 0, oldRange: [1, 3], newRange: [1, 4] }] }] };
  const c = review.findingsToComments(
    [
      { id: "F1", file: "a.txt", line: 2, summary: "in" },
      { id: "F2", file: "a.txt", line: 90, summary: "out" },
      { id: "F3", file: "z.txt", line: 1, summary: "other file" },
      { id: "F4", summary: "general", severity: "minor" },
    ],
    rv,
    "fle-1-review-1",
  );
  assert.deepEqual(c[0], { summary: "[F1] in", author: "fle-1-review-1", filePath: "a.txt", newLine: 2 });
  assert.equal(c[1].hunk, 1);
  assert.match(c[1].summary, /a\.txt:90, outside the changed lines/);
  assert.equal(c[2].filePath, "a.txt");
  assert.match(c[3].summary, /^\[F4\] \(minor\) general \(general\)/);
});

test("status: short answer names what waits on the person", () => {
  const r = started();
  toRound(r);
  const lines = status.statusLines(st.loadState(r.dir), { head: r.head(), dirty: [], agents: { "fle-1-impl-1": { status: { state: "blocked" } } } });
  const text = lines.join("\n");
  assert.match(text, /Chunks: 0\/1 approved/);
  assert.match(text, /Hunk review of chunk 1 round 1/);
});

test("plan status block is replaced in place, prose untouched", () => {
  const r = started();
  writeFileSync(st.paths(r.dir).plan, "# T\n\nprose\n\n<!-- feature:status -->\nold\n<!-- /feature:status -->\n\n## Decisions\n- x\n");
  toRound(r);
  status.refreshPlanStatus(st.loadState(r.dir));
  const text = readFileSync(st.paths(r.dir).plan, "utf8");
  assert.match(text, /prose/);
  assert.match(text, /## Decisions\n- x/);
  assert.match(text, /1\. one · in review/);
  assert.doesNotMatch(text, /\nold\n/);
});

test("spawn argv: interactive pi with chosen model, outlives parent, labelled, first task in argv", () => {
  const r = started("full");
  const s = st.loadState(r.dir);
  const argv = spawnArgv({ state: s, role: "implementer", chunk: 2, name: "fle-1-impl-2", task: "do it", space: "sp1", skillDir: "/skill" });
  const i = argv.indexOf("--");
  assert.deepEqual(argv.slice(0, 3), ["run", "--bg", "--json"]);
  assert.ok(argv.includes("--outlive-parent"));
  assert.ok(argv.includes("feature.id=fle-1") && argv.includes("feature.role=implementer") && argv.includes("feature.chunk=2"));
  assert.ok(!argv.some((a) => a.startsWith("herdr.")), "no Herdr tab of its own: listed under the overseer");
  const pi = argv.slice(i + 1);
  assert.equal(pi[0], "pi");
  assert.ok(!pi.includes("-p") && !pi.includes("--print"));
  assert.equal(pi[pi.indexOf("--model") + 1], "claude-opus-5.5");
  assert.equal(pi[pi.indexOf("--thinking") + 1], "high");
  assert.equal(pi[pi.length - 1], "do it");
  const t = started("tiny");
  assert.throws(() => spawnArgv({ state: st.loadState(t.dir), role: "reviewer", chunk: 1, name: "x", task: "t" }), /not enabled/);
});

test("only the overseer terminal processes the inbox; role agents never do", () => {
  const state = { overseer: { terminal: "t69" }, agents: { "f-impl-1": { address: "t6g" }, "f-review-1": { address: "t6v" } } };
  assert.equal(st.isOverseerTerminal(state, "t69"), true);
  assert.equal(st.isOverseerTerminal(state, "t6v"), false, "reviewer");
  assert.equal(st.isOverseerTerminal(state, "t6g"), false, "implementer");
  assert.equal(st.isOverseerTerminal(state, null), false, "outside hc");
  assert.equal(st.isOverseerTerminal({ overseer: null, agents: {} }, "t69"), false);
});

test("notes from an older Hunk window (comments / request_changes) are kept as notes for the reviewer, never decisions", () => {
  const r = started();
  const { round } = toRound(r);
  st.updateState(r.dir, (x) => { x.chunks[0].reviewer = "f-review-1"; });
  const s = st.loadState(r.dir);
  st.writeInbox(r.dir, decision(s, round, "comments", { hunkSession: "sess", notes: [{ id: "user:5", path: "a.txt", newRange: [1, 1], body: "yes, do that" }] }));
  const [o] = st.ingestInbox(r.dir);
  assert.equal(o.legacyNotes, true);
  assert.equal(o.notesTo, "f-review-1");
  assert.match(readFileSync(o.notesFile, "utf8"), /\[user:5\] a\.txt new:1\n   yes, do that/);
  const after = st.loadState(r.dir);
  assert.equal(after.chunks[0].rounds[0].decisions.length, 0, "not a decision");
  assert.equal(after.chunks[0].status, "in_review");
  assert.match(status.describeOutcome({ ...o, delivered: true }), /delivered to f-review-1/);
});
