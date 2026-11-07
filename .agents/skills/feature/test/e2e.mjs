// End-to-end CLI flow on a real temporary git repo, with fake hc / hunk /
// hunk-open / gh on PATH. Prints "E2E PASSED" only if every step checks out.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(SKILL, "bin", "feature.mjs");
const root = mkdtempSync(join(tmpdir(), "fw-e2e-"));
const bin = join(root, "bin");
const wt = join(root, "wt");
const origin = join(root, "origin.git");
const db = join(root, "hc.json");
const log = join(root, "calls.log");
mkdirSync(bin);

// ---- fakes --------------------------------------------------------------------
const script = (name, body) => {
  const p = join(bin, name);
  writeFileSync(p, `#!/usr/bin/env node\n${body}`);
  chmodSync(p, 0o755);
  return p;
};
writeFileSync(db, JSON.stringify({
  next: 100,
  terminals: {
    t1: { address: "t1", name: null, state: "live", labels: { "herdr.space": "sp1" }, status: { state: "working" } },
    // A foreign live terminal that already uses the reviewer's natural name.
    t9: { address: "t9", name: "fle-9-review-1", state: "live", labels: { "feature.id": "someone-else" } },
  },
}));
script("hc", `
const fs = require("fs");
const db = JSON.parse(fs.readFileSync(${JSON.stringify(db)}, "utf8"));
const a = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, "hc " + JSON.stringify(a) + "\\n");
const save = () => fs.writeFileSync(${JSON.stringify(db)}, JSON.stringify(db));
const find = (t) => Object.values(db.terminals).find((x) => x.address === t || x.name === t);
if (a[0] === "ls") { console.log(JSON.stringify({ terminals: Object.values(db.terminals).filter((t) => t.state === "live") })); }
else if (a[0] === "get") { const t = find(a[1]); if (!t) { process.stderr.write("not found"); process.exit(3); } console.log(JSON.stringify(t)); }
else if (a[0] === "run") {
  const name = a[a.indexOf("--name") + 1];
  const labels = {}; a.forEach((x, i) => { if (x === "--label") { const [k, v] = a[i + 1].split("="); labels[k] = v; } });
  const address = "t" + db.next++;
  db.terminals[address] = { address, name, state: "live", labels, argv: a.slice(a.indexOf("--") + 1), status: { state: "working" } };
  save();
  console.log(JSON.stringify({ address, name, first_message: { sent: true } }));
}
else if (a[0] === "send") { if (!find(a[1])) { process.stderr.write("not found"); process.exit(3); } }
else if (a[0] === "kill") { const t = find(a[1]); if (t) { t.state = "finished"; save(); } }
else if (a[0] === "rm") { const t = find(a[1]); if (t) { delete db.terminals[t.address]; save(); } }
else process.exit(9);
`);
const hunkOpen = script("hunk-open", `
const fs = require("fs");
const a = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, "hunk-open " + JSON.stringify(a) + "\\n");
if (a[0] !== "--feature-review" || a[2] !== "diff") process.exit(5);
const tok = JSON.parse(fs.readFileSync(a[1], "utf8"));
if (a[3] !== tok.base + "..." + tok.tip) process.exit(6);
// pi-send would announce its session id like this.
fs.mkdirSync(require("path").dirname(tok.sessionFile), { recursive: true });
fs.writeFileSync(tok.sessionFile, "sess-" + tok.round + "\\n");
`);
const hunk = script("hunk", `
const fs = require("fs");
const a = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, "hunk " + JSON.stringify(a) + "\\n");
if (a[0] === "session" && a[1] === "review") { console.log(JSON.stringify({ review: { files: [{ path: "a.txt", hunks: [{ index: 0, oldRange: [1, 1], newRange: [1, 2] }] }] } })); }
else if (a[0] === "session" && a[1] === "comment" && a[2] === "apply") {
  const input = fs.readFileSync(0, "utf8");
  fs.writeFileSync(${JSON.stringify(join(root, "applied-"))} + a[3] + ".json", input);
  console.log(JSON.stringify({ ok: true }));
} else if (a[0] === "session" && a[1] === "comment" && a[2] === "list") {
  if (a[3] !== "sess-1") process.exit(4);
  console.log(JSON.stringify({ comments: [
    { noteId: "user:q1", source: "user", author: "user", filePath: "a.txt", newRange: [1, 1], body: "why is this needed?" },
    { noteId: "mcp:ans1", parentId: "user:q1", source: "agent", author: "fle-9-impl-1", filePath: "a.txt", newRange: [1, 1], body: "Because X. Keep it?" },
    { noteId: "user:live5", parentId: "mcp:ans1", source: "user", author: "user", filePath: "a.txt", newRange: [1, 1], body: "no, rely on the API" },
  ] }));
} else if (a[0] === "session" && a[1] === "comment" && a[2] === "add") {
  fs.writeFileSync(${JSON.stringify(join(root, "reply-"))} + a[3] + ".json", JSON.stringify(a));
  console.log(JSON.stringify({ ok: true }));
} else process.exit(7);
`);
script("gh", `
const fs = require("fs");
const a = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, "gh " + JSON.stringify(a) + "\\n");
if (a[0] === "pr" && a[1] === "view") process.exit(1);
if (a[0] === "pr" && a[1] === "create") { if (!a.includes("--draft")) process.exit(8); console.log("https://github.com/x/y/pull/42"); }
`);

// ---- repo ---------------------------------------------------------------------
const git = (...a) => execFileSync("git", ["-C", wt, ...a], { encoding: "utf8" }).trim();
execFileSync("git", ["init", "-q", "--bare", origin]);
mkdirSync(wt);
git("init", "-q", "-b", "fle-9-thing");
git("config", "user.email", "t@t");
git("config", "user.name", "t");
writeFileSync(join(wt, ".gitignore"), ".plan.md\n.feature/\n");
writeFileSync(join(wt, "a.txt"), "1\n");
git("add", ".");
git("commit", "-qm", "init");
git("remote", "add", "origin", origin);
const commit = (file, text, msg, amend) => {
  writeFileSync(join(wt, file), text);
  git("add", ".");
  git("commit", "-q", ...(amend ? ["--amend", "--no-edit"] : ["-m", msg]));
  return git("rev-parse", "HEAD");
};

const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, HC_TERMINAL_ID: "t1", FEATURE_HUNK_OPEN: hunkOpen, FEATURE_HUNK_BIN: hunk, FEATURE_SKILL_DIR: SKILL };
function feature(...args) {
  const r = spawnSync("node", [CLI, ...args], { cwd: wt, env, encoding: "utf8" });
  return { code: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}
function ok(...args) {
  const r = feature(...args);
  assert.equal(r.code, 0, `feature ${args.join(" ")} failed:\n${r.out}`);
  return r.out;
}
function fails(pattern, ...args) {
  const r = feature(...args);
  assert.notEqual(r.code, 0, `feature ${args.join(" ")} should fail:\n${r.out}`);
  assert.match(r.out, pattern);
  return r.out;
}
const state = () => JSON.parse(readFileSync(join(wt, ".feature", "state.json"), "utf8"));
const decide = (n, kind, extra = {}) => {
  const tok = JSON.parse(readFileSync(join(wt, ".feature", "reviews", `c${n.chunk}-r${n.round}.token.json`), "utf8"));
  const d = { type: "feature-decision", id: `${kind}-${Math.random().toString(16).slice(2)}`, decision: kind, source: "hunk", featureId: tok.featureId, chunk: tok.chunk, round: tok.round, base: tok.base, tip: tok.tip, nonce: tok.nonce, hunkSession: `sess-${tok.round}`, notes: [], agentNotes: [], ...extra };
  writeFileSync(join(tok.inbox, `${Date.now()}-${d.id}.json`), JSON.stringify(d));
};

// ---- flow ---------------------------------------------------------------------
const cfgFile = join(root, "cfg.json");
const m = (thinking) => ({ provider: "github-copilot", model: "claude-opus-5.5", thinking });
writeFileSync(cfgFile, JSON.stringify({ preset: "medium", overseer: m("high"), roles: { researcher: { enabled: false }, planner: { enabled: true, ...m("high") }, implementer: { enabled: true, ...m("medium") }, reviewer: { enabled: true, ...m("high"), standards: ["AGENTS.md"] } } }));

ok("init", "--config", cfgFile, "--title", "Do the thing", "--ticket", "FLE-9");
fails(/already exists/, "init", "--config", cfgFile, "--title", "again", "--ticket", "FLE-9");
assert.equal(state().overseer.space, "sp1");
writeFileSync(join(wt, ".plan.md"), "# Do the thing\n\n## Goal\nx\n\n<!-- feature:status -->\n<!-- /feature:status -->\n");

ok("chunk", "add", "--title", "one");
ok("chunk", "add", "--title", "two");
let out = ok("spawn", "implementer", "--chunk", "1");
assert.match(out, /spawned fle-9-impl-1 \(t100\)/);
const hcdb = () => JSON.parse(readFileSync(db, "utf8"));
const impl = hcdb().terminals.t100;
assert.deepEqual(impl.labels, { "feature.id": "fle-9", "feature.role": "implementer", "feature.chunk": "1" });
assert.equal(impl.argv[0], "pi");
assert.ok(!impl.argv.includes("-p"));
assert.match(impl.argv[impl.argv.length - 1], /Overseer: t1 .*\.feature\/briefs\/1-impl\.md/);
assert.ok(readFileSync(log, "utf8").includes('"--outlive-parent"'));

ok("chunk", "start", "1");
fails(/no commits on top/, "chunk", "commit", "1");
const tip1 = commit("a.txt", "1\n2\n", "chunk one");
out = ok("chunk", "commit", "1");
assert.match(out, /chunk one/);
out = ok("spawn", "reviewer", "--chunk", "1");
assert.match(out, /spawned fle-9-review-1-2/, "collision with a foreign live terminal avoided");
fails(/no reviewer findings/, "review", "open", "1");
writeFileSync(join(wt, ".feature", "f1.json"), JSON.stringify({ findings: [{ id: "F1", severity: "major", file: "a.txt", line: 2, summary: "check this" }, { summary: "general remark" }] }));
ok("chunk", "review", "1", "--report", ".feature/r1.md", "--findings", ".feature/f1.json");
out = ok("review", "open", "1");
assert.match(out, /applied 2 reviewer note\(s\) to Hunk session sess-1 as fle-9-review-1-2/);
const applied = JSON.parse(readFileSync(join(root, "applied-sess-1.json"), "utf8"));
assert.deepEqual(applied.comments[0], { summary: "[F1] (major) check this", author: "fle-9-review-1-2", filePath: "a.txt", newLine: 2 });
assert.equal(state().chunks[0].rounds[0].hunkSession, "sess-1");
assert.match(readFileSync(join(wt, ".plan.md"), "utf8"), /1\. one · in review/);

// v2: the person's notes go to the reviewer (from Hunk), not through state.
// Old-style decisions are refused and change nothing.
decide({ chunk: 1, round: 1 }, "comments", { notes: [{ id: "user:c1", path: "a.txt", body: "do the rename" }] });
assert.match(ok("inbox"), /1 note\(s\) from the person \(sent with p from an older Hunk window\).* · delivered to fle-9-review-1-2/);
assert.match(readFileSync(log, "utf8"), /hc \["send","fle-9-review-1-2","Hunk notes from the person on chunk 1, round 1/);
assert.equal(state().chunks[0].status, "in_review");
assert.equal(state().chunks[0].rounds[0].decisions.length, 0);
const tok1 = JSON.parse(readFileSync(join(wt, ".feature", "reviews", "c1-r1.token.json"), "utf8"));
assert.equal(tok1.notesTo, "fle-9-review-1-2", "Hunk notes go to the chunk's reviewer");
assert.equal(tok1.overseer, "t1");

// The reviewer answers a live Hunk note as itself.
const reply = spawnSync("node", [CLI, "reply", "user:live5", "--text", "agreed"], { cwd: wt, env: { ...env, HC_TERMINAL_ID: "t101" }, encoding: "utf8" });
assert.equal(reply.status, 0, reply.stderr);
assert.match(reply.stdout, /replied to user:live5 in Hunk session sess-1 as fle-9-review-1-2/);
const replyArgs = JSON.parse(readFileSync(join(root, "reply-sess-1.json"), "utf8"));
assert.deepEqual(replyArgs.slice(0, 6), ["session", "comment", "add", "sess-1", "--reply-to", "user:live5"]);
fails(/no Hunk note user:nope/, "reply", "user:nope", "--text", "x");

// Fixes while round 1 is open: amend + a separate fix commit; review the WHOLE chunk again.
commit("a.txt", "1\n2b\n", null, true);
const fix = commit("b.txt", "fix\n", "separate fix");
out = ok("chunk", "commit", "1");
assert.match(out, /2 revision\(s\)/);
assert.match(out, /chunk one\n.*separate fix/);
assert.equal(state().chunks[0].rounds[0].status, "superseded");
writeFileSync(join(wt, ".feature", "f2.json"), JSON.stringify({ findings: [] }));
ok("chunk", "review", "1", "--report", ".feature/r2.md", "--findings", ".feature/f2.json");
out = ok("review", "open", "1");
assert.match(out, /round 2/);
const tok2 = JSON.parse(readFileSync(join(wt, ".feature", "reviews", "c1-r2.token.json"), "utf8"));
assert.equal(tok2.base, state().chunks[0].base, "round 2 covers base..latest, not just the fix");
assert.equal(tok2.tip, fix);
assert.notEqual(tip1, fix);

// Stale approvals are refused.
decide({ chunk: 1, round: 1 }, "approve");
assert.match(ok("inbox"), /IGNORED APPROVED .*no longer current/);
const extra = commit("c.txt", "x\n", "unreviewed extra");
decide({ chunk: 1, round: 2 }, "approve");
assert.match(ok("inbox"), /IGNORED APPROVED .*code changed since this review opened/);
assert.equal(state().chunks[0].status, "in_review");
git("reset", "-q", "--hard", fix);
assert.notEqual(extra, fix);
decide({ chunk: 1, round: 2 }, "approve");
assert.match(ok("inbox"), /chunk 1 round 2: APPROVED/);
assert.equal(state().chunks[0].status, "approved");

fails(/every chunk must be approved/, "pr", "--title", "x", "--body", ".feature/pr.md");

// Chunk 2 starts at the approved tip.
ok("chunk", "start", "2");
assert.equal(state().chunks[1].base, fix);

// Status / resume see a lost agent.
const d = hcdb();
d.terminals.t100.state = "finished";
writeFileSync(db, JSON.stringify(d));
out = ok("status");
assert.match(out, /Chunks: 1\/2 approved/);
out = ok("resume");
assert.match(out, /agent fle-9-impl-1 .* is gone/);

// Cleanup kills only terminals labelled with this feature.
const st0 = state();
st0.agents["fle-9-plan"] = { role: "planner", address: "t9", status: "live" };
writeFileSync(join(wt, ".feature", "state.json"), JSON.stringify(st0));
out = ok("cleanup", "--all");
assert.match(out, /fle-9-plan: not owned: left alone/);
assert.match(out, /fle-9-review-1-2: killed/);
assert.ok(hcdb().terminals.t9, "foreign terminal untouched");

// Finish chunk 2 and open the draft PR.
commit("d.txt", "2\n", "chunk two");
ok("chunk", "commit", "2");
ok("chunk", "review", "2", "--report", ".feature/r3.md", "--findings", ".feature/f2.json");
ok("review", "open", "2");
decide({ chunk: 2, round: 1 }, "approve");
ok("inbox");
writeFileSync(join(wt, ".feature", "pr.md"), "body");
// Stacked PR: the base must exist on origin; it is passed to gh.
fails(/base branch nope does not exist on origin/, "pr", "--title", "FLE-9 thing", "--body", ".feature/pr.md", "--base", "nope");
execFileSync("git", ["-C", wt, "push", "-q", "origin", `${git("rev-parse", "HEAD~3")}:refs/heads/parent-feature`]);
out = ok("pr", "--title", "FLE-9 thing", "--body", ".feature/pr.md", "--base", "parent-feature");
assert.match(out, /draft PR opened: https:\/\/github.com\/x\/y\/pull\/42 \(base parent-feature\)/);
const create = readFileSync(log, "utf8").split("\n").find((l) => l.startsWith('gh ["pr","create"'));
assert.ok(create.includes('"--base","parent-feature"') && create.includes('"--draft"'), create);
assert.equal(state().pr.base, "parent-feature");
assert.equal(state().phase, "done");
assert.equal(execFileSync("git", ["--git-dir", origin, "rev-parse", "fle-9-thing"], { encoding: "utf8" }).trim(), git("rev-parse", "HEAD"));
assert.ok(existsSync(join(wt, ".feature", "state.json")), "state left in place");
assert.ok(!readFileSync(log, "utf8").includes("linear"), "no Linear calls");

console.log("E2E PASSED");
