// Herdr side of the nvim-server integration (~/.bin/lib/nvim-session.sh).
// Each popup runs a script from ~/.bin in a core terminal shown in a dialog
// overlay over the window. The terminal gets NVIM_SESSION = this space's
// session key, so the scripts find the space's nvim-server socket, and a
// label with the overlay id, so `nvs_focus` can close the popup after opening
// something in nvim.

import { focused, exec, hc, home, notify, openOverlay, closeOverlay, shared, setShared } from "herdr";

export const POPUPS = {
  files:   { title: "Files",    argv: ["nvim-pick-files"],   width: 0.8, height: 0.7 },
  buffers: { title: "Buffers",  argv: ["nvim-pick-buffers"], width: 0.8, height: 0.7 },
  grep:    { title: "Grep",     argv: ["nvim-grep"],         width: 0.9, height: 0.85 },
  yazi:    { title: "Yazi",     argv: ["nvim-yazi", "--here"], width: 0.9, height: 0.85, passCwd: true },
  // Kept alive when hidden (opening a file, or a click beside the popup):
  // the next open shows the same lazygit.
  lazygit: { title: "Lazygit",  argv: ["lazygit"],           width: 0.9, height: 0.9, reuse: true },
};

// What the person's shells see (~/.bin, nvm, XDG_CONFIG_HOME for lazygit's
// config, ...). The core's and exec's environment lacks those, and a login
// shell takes ~2 s, so a few non-secret variables are read once and cached in
// shared state, refreshed when a shell startup file changes (or after a day).
// Secrets (~/.env) are left out.
const ENV_KEY = "nvim.popup.env";
const ENV_VARS = ["PATH", "XDG_CONFIG_HOME", "EDITOR", "VISUAL",
  "NVM_DIR", "NVM_BIN", "NVM_INC", "BUN_INSTALL", "PNPM_HOME",
  "FZF_DEFAULT_COMMAND", "FZF_DEFAULT_OPTS", "BAT_THEME"];
const RC_FILES = [".zshenv", ".zprofile", ".zshrc", ".zlogin"];
async function rcStamp() {
  try {
    const r = await exec("/bin/sh", ["-c", 'cd "$HOME" && stat -L -f %m "$@" 2>/dev/null; true', "sh", ...RC_FILES]);
    return r.stdout.trim().split(/\s+/).join(",");
  } catch (_) { return ""; }
}
async function userEnv() {
  const cached = shared(ENV_KEY);
  const stamp = await rcStamp();
  if (cached?.env && cached.stamp === stamp && Date.now() - (cached.at ?? 0) < 24 * 3600 * 1000) return cached.env;
  const env = {};
  try {
    const r = await exec("/bin/zsh", ["-lic", "print -rn -- __ENV__; env -0"]);
    const out = r.stdout.slice(r.stdout.indexOf("__ENV__") + 7);
    for (const kv of out.split("\0")) {
      const i = kv.indexOf("=");
      if (i > 0 && ENV_VARS.includes(kv.slice(0, i))) env[kv.slice(0, i)] = kv.slice(i + 1);
    }
  } catch (_) {}
  const h = home();
  const parts = [];
  for (const d of [`${h}/.bin`, `${h}/.local/bin`, ...(env.PATH ?? "").split(":"), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"])
    if (d && !parts.includes(d)) parts.push(d);
  const found = Boolean(env.PATH);
  env.PATH = parts.join(":");
  if (found) setShared(ENV_KEY, { env, stamp, at: Date.now() });
  return env;
}

const OPEN_KEY = "nvim.popup.open";

async function hcJson(args) {
  const r = await hc([args[0], "--json", ...args.slice(1)]);
  if (r.code !== 0) throw new Error(r.stderr.trim() || `hc ${args[0]} failed`);
  return JSON.parse(r.stdout);
}

export async function openPopup(kind, self) {
  const spec = POPUPS[kind];
  if (!spec) throw new Error(`unknown popup ${kind}`);
  const f = focused();
  if (!f?.space) throw new Error("no space focused");
  if (f.space.includes("/")) throw new Error("nvim popups are local-machine only for now");
  const session = `herdr-${f.space}`;

  // What the focused pane runs, and where.
  let cwd = f.cwd || home();
  let fg = "";
  if (f.terminal) {
    try {
      const t = await hcJson(["get", f.terminal]);
      fg = t.foreground?.name || "";
      cwd = t.foreground?.cwd || t.cwd || cwd;
    } catch (_) {}
  }

  // Popups started earlier in this space.
  let ours = [];
  try {
    const ls = await hcJson(["ls", "--label", `nvim.session=${session}`]);
    for (const t of ls.terminals || []) {
      if (t.state !== "live") continue;
      try { ours.push(await hcJson(["get", t.address])); } catch (_) {}
    }
  } catch (_) {}

  // One showing already (the last one opened, if a terminal overlay is still
  // up): close it. Opening the same kind again is a toggle.
  const last = shared(OPEN_KEY);
  if (last?.id) {
    let showing = false;
    try {
      const st = JSON.parse((await exec("herdr-app", ["status"])).stdout);
      showing = (st.overlays ?? []).includes("layout");
    } catch (_) {}
    setShared(OPEN_KEY, null);
    if (showing) {
      closeOverlay(last.id);
      // A hidden picker is no use; only reusable popups (lazygit) stay.
      if (!POPUPS[last.kind]?.reuse)
        for (const t of ours) if (t.labels?.["nvim.popup"] === last.kind) await hc(["kill", t.address]);
      if (last.kind === kind && last.session === session) return;
    }
  }
  const mine = ours.filter((t) => t.labels?.["nvim.popup"] === kind);

  let address = spec.reuse ? mine[0]?.address : null;
  for (const t of mine) if (t.address !== address) await hc(["kill", t.address]);

  if (!address) {
    const argv = [...spec.argv];
    if (spec.passCwd) argv.push(cwd, fg);
    const env = [
      ...Object.entries(await userEnv()).map(([k, v]) => `${k}=${v}`),
      `NVIM_SESSION=${session}`,
      `NVIM_POPUP=${kind}`,
      `NVS_CWD=${cwd}`,
    ];
    const r = await hcJson(["run", "--bg", "--no-parent", "--cwd", cwd,
      "--label", `nvim.popup=${kind}`, "--label", `nvim.session=${session}`,
      "--", "/usr/bin/env", ...env, ...argv]);
    address = r.address;
    if (!address) throw new Error(`couldn't start ${spec.title}`);
  }

  // Close the launcher first: a dialog opened while it's up doesn't get the
  // keyboard (closing the launcher hands it back to the pane).
  if (self) closeOverlay(self);
  const id = openOverlay({
    kind: "dialog",
    width: spec.width,
    height: spec.height,
    layout: { type: "block", content: { terminal: address } },
  });
  setShared(OPEN_KEY, { id, kind, session });
  await hc(["label", address, `nvim.overlay=${id}`]);
  return address;
}

// For launcher mods: open the popup, then close the launcher's own overlay.
export function launch(kind, cx, self) {
  cx.spawn(async (cx) => {
    try {
      await openPopup(kind, self);
    } catch (e) {
      notify({ title: `nvim ${kind}`, body: String(e?.message ?? e), level: "error" });
    }
    if (self) closeOverlay(self);
  });
}
