// Installation: links resolve into the dotfiles checkout; the global git
// ignore covers the workflow files (and still has what it had); install.sh
// reproduces it. Prints "INSTALL OK".
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const H = homedir();
const D = join(H, ".dotfiles");
const real = (p) => realpathSync(p);

assert.equal(real(join(H, ".agents/skills/feature/SKILL.md")), join(D, ".agents/skills/feature/SKILL.md"));
assert.equal(real(join(H, ".pi/agent/extensions/feature-workflow.ts")), join(D, ".pi/agent/extensions/feature-workflow.ts"));
assert.equal(real(join(H, ".pi/agent/extensions/hunk-listen.ts")), join(D, ".pi/agent/extensions/hunk-listen.ts"));
assert.equal(real(join(H, ".bin/feature")), join(D, ".bin/feature"));
assert.equal(real(join(H, ".config/hunk/extensions/pi-send.ts")), join(D, ".config/hunk/extensions/pi-send.ts"));
const help = execFileSync(join(H, ".bin/feature"), ["help"], { encoding: "utf8" });
assert.match(help, /feature <command>/);

// Global ignore applies in any repo (fresh one here), via git's own resolution.
const repo = mkdtempSync(join(tmpdir(), "fw-ign-"));
execFileSync("git", ["init", "-q", repo]);
const ignored = execFileSync("git", ["-C", repo, "check-ignore", ".plan.md", ".feature/state.json"], { encoding: "utf8" });
assert.match(ignored, /\.plan\.md/);
assert.match(ignored, /\.feature\/state\.json/);
const excludes = (() => {
  try {
    return execFileSync("git", ["config", "--global", "--path", "core.excludesFile"], { encoding: "utf8" }).trim();
  } catch {
    return join(process.env.XDG_CONFIG_HOME || join(H, ".config"), "git", "ignore");
  }
})();
assert.match(readFileSync(excludes, "utf8"), /\*\*\/\.claude\/settings\.local\.json/, "pre-existing entry kept");

// install.sh reproduces it.
const sh = readFileSync(join(D, "install.sh"), "utf8");
assert.match(sh, /for ext in hunk-listen\.ts feature-workflow\.ts; do/);
assert.match(sh, /for pattern in \.plan\.md \.feature\/; do/);
assert.match(sh, /grep -qxF "\$pattern" "\$excludes" \|\| printf '%s\\n' "\$pattern" >> "\$excludes"/);
execFileSync("bash", ["-n", join(D, "install.sh")]);
// The skill is linked by stow (not excluded); ~/.pi stays out of stow.
const ignore = readFileSync(join(D, ".stow-local-ignore"), "utf8");
assert.doesNotMatch(ignore, /\.agents/);
assert.match(ignore, /\^\/\\\.pi\$/);

console.log("INSTALL OK");
