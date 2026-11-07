// Git facts the workflow binds decisions to. All read-only except push.
import { execFileSync } from "node:child_process";

export function git(cwd, args, opts = {}) {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", opts.quiet ? "ignore" : "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

export function tryGit(cwd, args) {
  try {
    return git(cwd, args, { quiet: true });
  } catch {
    return null;
  }
}

export const head = (cwd) => git(cwd, ["rev-parse", "HEAD"]);
export const resolve = (cwd, ref) => git(cwd, ["rev-parse", "--verify", `${ref}^{commit}`]);
export const toplevel = (cwd) => git(cwd, ["rev-parse", "--show-toplevel"]);
export const branch = (cwd) => tryGit(cwd, ["symbolic-ref", "--short", "HEAD"]);

/** Changed paths (ignored files such as .plan.md / .feature/ excluded by git). */
export function dirtyPaths(cwd) {
  const out = git(cwd, ["status", "--porcelain=v1", "--untracked-files=all"]);
  return out ? out.split("\n").map((l) => l.slice(3)) : [];
}

export function isAncestor(cwd, a, b) {
  try {
    execFileSync("git", ["-C", cwd, "merge-base", "--is-ancestor", a, b], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Commits in base..tip, oldest first: [{sha, subject}]. */
export function commitsBetween(cwd, base, tip) {
  const out = git(cwd, ["log", "--reverse", "--format=%H%x09%s", `${base}..${tip}`]);
  return out ? out.split("\n").map((l) => ({ sha: l.split("\t")[0], subject: l.split("\t").slice(1).join("\t") })) : [];
}

export function isIgnored(cwd, path) {
  try {
    execFileSync("git", ["-C", cwd, "check-ignore", "-q", "--no-index", path], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
