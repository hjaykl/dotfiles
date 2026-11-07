// hunk-open: the feature review token reaches Hunk's environment (direct and
// via a Herdr tab), plain usage is unchanged, a missing token is an error.
// Uses fake hunk / hc / herdr-app on PATH: never touches the real window.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const HUNK_OPEN = join(homedir(), ".dotfiles", ".bin", "hunk-open");
const root = mkdtempSync(join(tmpdir(), "fw-hunkopen-"));
const bin = join(root, "bin");
mkdirSync(bin);
const rec = join(root, "rec.jsonl");
const fake = (name, body) => {
  writeFileSync(join(bin, name), `#!/usr/bin/env node\n${body}`);
  chmodSync(join(bin, name), 0o755);
};
fake("hunk", `require("fs").appendFileSync(${JSON.stringify(rec)}, JSON.stringify({ tool: "hunk", args: process.argv.slice(2), FEATURE_REVIEW: process.env.FEATURE_REVIEW ?? null }) + "\\n");`);
fake("hc", `const a = process.argv.slice(2); if (a[0] === "get") console.log(JSON.stringify({ labels: { "herdr.space": "spTEST" } })); else if (a[0] !== "kill") process.exit(1);`);
fake("herdr-app", `const a = process.argv.slice(2);
if (a[0] === "ls") console.log(JSON.stringify({ spaces: [] }));
else if (a[0] === "do" && a[1] === "tab.new") require("fs").appendFileSync(${JSON.stringify(rec)}, JSON.stringify({ tool: "herdr-app", args: a }) + "\\n");
else process.exit(1);`);

const token = join(root, "c1-r1.token.json");
writeFileSync(token, "{}");
const base = { PATH: `${bin}:/usr/bin:/bin:/opt/homebrew/bin`, HOME: homedir() };
const run = (env, ...args) => {
  rmSync(rec, { force: true });
  const r = spawnSync("bash", [HUNK_OPEN, ...args], { env: { ...base, ...env }, cwd: root, encoding: "utf8" });
  const lines = existsSync(rec) ? readFileSync(rec, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse) : [];
  return { code: r.status, err: r.stderr, lines };
};

// Direct mode (no tmux / Herdr).
let r = run({}, "--feature-review", token, "diff", "aaa...bbb");
assert.equal(r.code, 0, r.err);
assert.deepEqual(r.lines[0].args, ["diff", "aaa...bbb"]);
assert.equal(r.lines[0].FEATURE_REVIEW, token);

r = run({}, "diff");
assert.equal(r.code, 0, r.err);
assert.deepEqual(r.lines[0].args, ["diff"]);
assert.equal(r.lines[0].FEATURE_REVIEW, null, "plain review has no token");

r = run({}, "--feature-review", join(root, "missing.json"), "diff");
assert.equal(r.code, 2);
assert.equal(r.lines.length, 0);

// Herdr mode: the tab's argv carries the token to the --run side.
r = run({ HC_TERMINAL_ID: "t1" }, "--feature-review", token, "diff", "aaa...bbb");
assert.equal(r.code, 0, r.err);
const tab = r.lines.find((l) => l.tool === "herdr-app");
const argv = JSON.parse(tab.args[tab.args.indexOf("--argv") + 1]);
assert.deepEqual(argv.slice(1), ["--feature-review", token, "--run", "diff", "aaa...bbb"]);
assert.equal(tab.args[tab.args.indexOf("--space") + 1], "spTEST");

r = run({ HC_TERMINAL_ID: "t1" }, "show", "HEAD");
const plain = JSON.parse(r.lines.find((l) => l.tool === "herdr-app").args[r.lines[0].args.indexOf("--argv") + 1]);
assert.deepEqual(plain.slice(1), ["--run", "show", "HEAD"]);

// The --run side (inside the tab) exports the token to hunk.
r = run({}, "--feature-review", token, "--run", "diff", "aaa...bbb");
assert.equal(r.code, 0, r.err);
const h = r.lines.find((l) => l.tool === "hunk");
assert.deepEqual(h.args, ["diff", "aaa...bbb"]);
assert.equal(h.FEATURE_REVIEW, token);

console.log("HUNK-OPEN OK");
