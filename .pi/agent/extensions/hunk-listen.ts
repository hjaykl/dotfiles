/**
 * hunk-listen: let this pi receive your Hunk review notes.
 *
 *   /hunk-listen   toggle listening for this tmux session / Herdr space
 *
 * One listener per session: the socket is named after the session
 * (~/.bin/lib/nvim-session.sh: the tmux session, or "herdr-<space id>"), so
 * Hunk's pi-send extension (~/.config/hunk/extensions/pi-send.ts) finds it
 * without guessing, and a second pi can't listen while one is. It can take
 * over (the first one is told and stops).
 *
 *   <dir>/<key>.sock      the listener (dir: $XDG_RUNTIME_DIR or /tmp, /hunk-pi)
 *   <dir>/<key>.pending/  reviews written while nobody listened (or a send
 *                         that didn't finish): offered on /hunk-listen,
 *                         picked up while listening
 *
 * Protocol: one JSON line each way.
 *   → {type:"ping"}                       ← {ok, pid, terminal, cwd}
 *   → {type:"review", text, file?}         ← {ok}   (file: a pending copy to delete)
 *   → {type:"release"}                     ← {ok}   (stop listening: taken over)
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { execFileSync } from "node:child_process";
import { createServer, connect, type Server } from "node:net";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DIR = join(process.env.XDG_RUNTIME_DIR || "/tmp", "hunk-pi");
const STATUS = "hunk-listen";

function sessionKey(): string | null {
  try {
    const key = execFileSync("bash", ["-c", '. "$HOME/.bin/lib/nvim-session.sh" && nvs_key'], {
      encoding: "utf8",
      timeout: 3000,
      env: { ...process.env, HOME: homedir() },
    }).trim();
    return key || null;
  } catch {
    return null;
  }
}

/** Send one JSON line to a socket, resolve with the parsed reply (null: nobody there). */
function request(sock: string, msg: object, timeoutMs = 1500): Promise<any | null> {
  return new Promise((resolve) => {
    const c = connect(sock);
    let buf = "";
    const done = (v: any) => {
      c.destroy();
      resolve(v);
    };
    c.setTimeout(timeoutMs, () => done(null));
    c.on("error", () => done(null));
    c.on("connect", () => c.write(JSON.stringify(msg) + "\n"));
    c.on("data", (d) => {
      buf += String(d);
      const i = buf.indexOf("\n");
      if (i >= 0) {
        try {
          done(JSON.parse(buf.slice(0, i)));
        } catch {
          done(null);
        }
      }
    });
  });
}

export default function (pi: ExtensionAPI) {
  let server: Server | null = null;
  let key: string | null = null;
  let busy = false;
  let poll: ReturnType<typeof setInterval> | null = null;
  let ui: ExtensionContext["ui"] | null = null;

  const sockPath = (k: string) => join(DIR, `${k}.sock`);
  const pendingDir = (k: string) => join(DIR, `${k}.pending`);

  pi.on("agent_start", async () => {
    busy = true;
  });
  pi.on("agent_settled", async () => {
    busy = false;
  });

  function deliver(text: string) {
    if (busy) pi.sendUserMessage(text, { deliverAs: "followUp" });
    else pi.sendUserMessage(text);
  }

  function pendingFiles(k: string): string[] {
    const d = pendingDir(k);
    if (!existsSync(d)) return [];
    return readdirSync(d)
      .filter((f) => f.endsWith(".txt"))
      .sort()
      .map((f) => join(d, f));
  }

  /** Deliver (and remove) pending reviews; minAgeMs leaves fresh ones to their socket send. */
  function drainPending(k: string, minAgeMs = 0): number {
    let n = 0;
    for (const f of pendingFiles(k)) {
      if (minAgeMs && Date.now() - statSync(f).mtimeMs < minAgeMs) continue;
      try {
        const text = readFileSync(f, "utf8");
        unlinkSync(f);
        if (text.trim()) {
          deliver(text);
          n++;
        }
      } catch {}
    }
    return n;
  }

  function setStatus(text: string | undefined) {
    ui?.setStatus(STATUS, text);
  }

  async function stop(reason?: string, unlink = true) {
    if (poll) clearInterval(poll);
    poll = null;
    const s = server;
    server = null;
    if (s) await new Promise<void>((r) => s.close(() => r()));
    if (key && unlink) {
      try {
        unlinkSync(sockPath(key));
      } catch {}
    }
    setStatus(reason);
  }

  function start(k: string): Promise<void> {
    mkdirSync(DIR, { recursive: true, mode: 0o700 });
    mkdirSync(pendingDir(k), { recursive: true, mode: 0o700 });
    try {
      unlinkSync(sockPath(k));
    } catch {}
    const s = createServer((conn) => {
      let buf = "";
      conn.on("error", () => {});
      conn.on("data", (d) => {
        buf += String(d);
        const i = buf.indexOf("\n");
        if (i < 0) return;
        let msg: any;
        try {
          msg = JSON.parse(buf.slice(0, i));
        } catch {
          conn.end(JSON.stringify({ ok: false, error: "bad request" }) + "\n");
          return;
        }
        if (msg.type === "ping") {
          conn.end(
            JSON.stringify({
              ok: true,
              pid: process.pid,
              terminal: (process.env.TMUX ? process.env.TMUX_PANE : process.env.HC_TERMINAL_ID) || null,
              cwd: process.cwd(),
            }) + "\n",
          );
        } else if (msg.type === "review" && typeof msg.text === "string") {
          // A review with a pending copy: whoever removes the copy delivers it
          // (this, or the pending poll), so it never arrives twice.
          let mine = true;
          if (msg.file) {
            try {
              unlinkSync(msg.file);
            } catch {
              mine = false;
            }
          }
          conn.end(JSON.stringify({ ok: true }) + "\n");
          if (mine) deliver(msg.text);
        } else if (msg.type === "release") {
          conn.end(JSON.stringify({ ok: true }) + "\n");
          ui?.notify("Another pi took over Hunk reviews for this session", "warning");
          void stop(undefined, false); // the new listener owns the socket path now
        } else {
          conn.end(JSON.stringify({ ok: false, error: "unknown request" }) + "\n");
        }
      });
    });
    server = s;
    key = k;
    return new Promise((resolve, reject) => {
      s.once("error", reject);
      s.listen(sockPath(k), () => {
        s.off("error", reject);
        // Reviews whose send didn't finish (Hunk quitting) land as files.
        poll = setInterval(() => drainPending(k, 5000), 3000);
        setStatus("hunk ◉ listening");
        resolve();
      });
    });
  }

  pi.registerCommand("hunk-listen", {
    description: "Toggle receiving Hunk review notes in this pi (one listener per tmux session / Herdr space)",
    handler: async (_args, ctx) => {
      ui = ctx.ui;
      if (server) {
        await stop(undefined);
        ctx.ui.notify("Stopped listening for Hunk reviews", "info");
        return;
      }
      const k = sessionKey();
      if (!k) {
        ctx.ui.notify("hunk-listen: not in a tmux session or Herdr space", "error");
        return;
      }
      const other = await request(sockPath(k), { type: "ping" });
      if (other?.ok) {
        const who = `pi ${other.terminal ?? `pid ${other.pid}`} (${other.cwd})`;
        const take = ctx.hasUI && (await ctx.ui.confirm("Hunk reviews", `${who} is already listening for this session. Take over?`));
        if (!take) {
          ctx.ui.notify(`Not listening: ${who} already is`, "warning");
          return;
        }
        await request(sockPath(k), { type: "release" });
      }
      try {
        await start(k);
      } catch (e) {
        ctx.ui.notify(`hunk-listen: ${String(e)}`, "error");
        return;
      }
      const waiting = pendingFiles(k).length;
      if (waiting && ctx.hasUI && (await ctx.ui.confirm("Hunk reviews", `${waiting} review${waiting === 1 ? "" : "s"} sent while nobody was listening. Receive now? (No discards them)`))) {
        drainPending(k);
      } else if (waiting) {
        for (const f of pendingFiles(k)) rmSync(f, { force: true });
      }
      ctx.ui.notify(`Listening for Hunk reviews (${k})`, "info");
    },
  });

  pi.on("session_shutdown", async () => {
    await stop(undefined);
  });
  // Exits that skip session_shutdown: don't leave a dead socket behind
  // (harmless anyway: the next /hunk-listen finds nobody answering it).
  process.on("exit", () => {
    if (server && key) {
      try {
        unlinkSync(sockPath(key));
      } catch {}
    }
  });
}
