// Read-only lock in a role agent, with a real pi in hc: the launch task and hc
// messages reach the agent, the person's typing doesn't, /unlock lifts it.
// A probe extension loaded after feature-workflow records what got through
// (and handles it, so no model is called). Prints "PI LOCK OK".
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "fw-lock-"));
const log = join(dir, "log.jsonl");
writeFileSync(join(dir, "probe.ts"), `import { appendFileSync } from "node:fs";
export default function (pi: any) {
  pi.on("input", async (e: any) => { appendFileSync(${JSON.stringify(log)}, JSON.stringify(e.text) + "\\n"); return { action: "handled" }; });
}`);
const hc = (...a) => execFileSync("hc", a, { encoding: "utf8" });
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const name = `fw-lock-${process.pid}`.slice(0, 32);
const ext = join(homedir(), ".pi", "agent", "extensions", "feature-workflow.ts");
hc("run", "--bg", "--json", "--no-notify", "--name", name, "--label", "feature.role=reviewer", "--cwd", dir, "--",
  "pi", "--no-session", "--no-extensions", "-e", ext, "-e", join(dir, "probe.ts"), "launch task");
try {
  const seen = () => (existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse) : []);
  for (let i = 0; i < 60 && !seen().length; i++) sleep(250);
  hc("send", name, "message via hc");
  sleep(1500);
  // hc's own notes (a background check of the agent exited) must get through too.
  const child = `${name}-c`.slice(0, 32);
  hc("run", "--bg", "--json", "--parent", name, "--name", child, "--", "sh", "-c", "exit 3");
  for (let i = 0; i < 40 && !seen().some((t) => /exited/.test(t)); i++) sleep(250);
  try { hc("rm", child); } catch {}
  // Hunk's p: hc send from a non-agent terminal arrives untagged; pi-send tags it.
  const sender = `${name}-h`.slice(0, 32);
  hc("run", "--bg", "--json", "--no-notify", "--no-parent", "--name", sender, "--", "sh", "-c",
    `hc send ${name} '<hunk-notes chunk="1" round="1" session="s">
note
</hunk-notes>'; hc send ${name} 'untagged from a shell'`);
  try { hc("wait", sender, "--timeout", "30"); } catch {}
  sleep(1000);
  try { hc("rm", sender); } catch {}
  hc("keys", name, ..."typed".split(""), "enter");
  sleep(1500);
  const got = seen().map((t) => t.replace(/^<hc from="[^"]+">(.*)<\/hc>$/s, "hc:$1").replace(/^<hc>.*exited \(exit 3\).*$/s, "hc-note:exited"));
  assert.deepEqual(got.map((t) => (t.startsWith("<hunk-notes") ? "hunk-notes" : t)), ["launch task", "hc:message via hc", "hc-note:exited", "hunk-notes"]);
  assert.match(hc("read", name, "--lines", "0"), /read-only\): talk to the overseer/);
  hc("keys", name, ..."/unlock".split(""), "enter");
  sleep(800);
  hc("keys", name, ..."after".split(""), "enter");
  sleep(1500);
  assert.equal(seen().at(-1), "after");
  console.log("PI LOCK OK");
} finally {
  try { hc("kill", name); hc("rm", name); } catch {}
}
