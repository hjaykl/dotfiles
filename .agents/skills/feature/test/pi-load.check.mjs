// Load check: a real pi process (RPC mode, no session, no model call) loads the
// installed extension from ~/.pi/agent/extensions and the skill from
// ~/.agents/skills. Prints "PI LOAD OK" only if /feature, skill:feature and
// the workflow_config tool are present and no extension error was reported.
import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync, readdirSync } from "node:fs";

function findPiPackage() {
  const releases = join(homedir(), ".pi", "agent", "install", "releases");
  const versions = readdirSync(releases).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  for (const v of versions.reverse()) {
    const p = join(releases, v, "node_modules", "@earendil-works", "pi-coding-agent");
    if (existsSync(join(p, "dist", "core", "extensions", "index.js"))) return p;
  }
  throw new Error("pi package not found");
}

const ext = join(homedir(), ".pi", "agent", "extensions", "feature-workflow.ts");
const real = realpathSync(ext);
if (!real.includes("/.dotfiles/")) throw new Error(`extension is not the dotfiles copy: ${real}`);

const child = spawn("pi", ["--mode", "rpc", "--no-session"], { cwd: tmpdir(), stdio: ["pipe", "pipe", "pipe"] });
let buf = "";
let stderr = "";
const replies = new Map();
const errors = [];
child.stderr.on("data", (d) => (stderr += d));
child.stdout.on("data", (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    if (msg.type === "response") replies.set(msg.command, msg);
    if (msg.type === "extension_error" || /error/i.test(msg.type ?? "") || (msg.method === "notify" && msg.notifyType === "error")) errors.push(line);
  }
});
const send = (o) => child.stdin.write(JSON.stringify(o) + "\n");
const until = async (cmd, ms = 20000) => {
  const end = Date.now() + ms;
  while (!replies.has(cmd)) {
    if (Date.now() > end) throw new Error(`no ${cmd} reply; stderr: ${stderr.slice(-2000)}`);
    await new Promise((r) => setTimeout(r, 100));
  }
  return replies.get(cmd);
};

try {
  send({ type: "get_commands" });
  const cmds = (await until("get_commands")).data.commands;
  const feature = cmds.find((c) => c.name === "feature" && c.source === "extension");
  const skill = cmds.find((c) => c.name === "skill:feature" && c.source === "skill");
  if (!feature) throw new Error("/feature command missing");
  if (realpathSync(feature.sourceInfo.path) !== real) throw new Error(`/feature came from ${feature.sourceInfo.path}`);
  if (!skill) throw new Error("skill:feature missing");
  send({ type: "get_state" });
  const state = JSON.stringify((await until("get_state")).data);
  // Tool registration: ask pi for the registered tools via the codemode-free path.
  send({ type: "get_entries" });
  await until("get_entries");
  if (errors.length) throw new Error(`extension errors:\n${errors.join("\n")}`);
  if (/feature-workflow/.test(stderr) && /error/i.test(stderr)) throw new Error(`stderr: ${stderr}`);
  // /reload must really reload the library: pi's jiti (moduleCache: false)
  // re-reads .js/.ts on every load but Node caches .mjs for the process, and a
  // dynamic import() bypasses jiti. So: .js library, static imports only.
  const src = (await import("node:fs")).readFileSync(real, "utf8");
  if (/import\(/.test(src)) throw new Error("extension uses dynamic import(): /reload would keep a stale library");
  if (!/from "\.\.\/\.\.\/\.\.\/\.agents\/skills\/feature\/lib\/state\.js"/.test(src)) throw new Error("extension must import the library statically");
  const libDir = join(realpathSync(join(homedir(), ".agents", "skills", "feature")), "lib");
  const mjs = readdirSync(libDir).filter((f) => f.endsWith(".mjs"));
  if (mjs.length) throw new Error(`library .mjs files are cached across /reload: ${mjs.join(", ")}`);
  console.log(`loaded /feature from ${feature.sourceInfo.path}; skill ${skill.sourceInfo.path}`);
  // Tools: load the same installed file through pi's own extension loader.
  const { loadExtensions } = await import(join(process.env.PI_PKG_DIR ?? findPiPackage(), "dist", "core", "extensions", "index.js"));
  const res = await loadExtensions([ext], tmpdir());
  if (res.errors?.length) throw new Error(`loader errors: ${JSON.stringify(res.errors)}`);
  const tools = [...res.extensions[0].tools.keys()];
  if (!tools.includes("workflow_config")) throw new Error(`workflow_config not registered (tools: ${tools.join(", ")})`);
  console.log(`tools: ${tools.join(", ")}; commands: ${[...res.extensions[0].commands.keys()].join(", ")}`);
  console.log("PI LOAD OK");
} finally {
  child.kill();
}
