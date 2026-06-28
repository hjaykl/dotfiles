/**
 * Caffeinate Keep Awake Extension
 *
 * Keeps the Mac awake using `caffeinate` while the agent is working.
 * Starts a `caffeinate -w $$` subprocess on agent_start, kills it on agent_end.
 *
 * Place in ~/.pi/agent/extensions/ for auto-discovery.
 * Hot-reloadable with /reload.
 */

import { spawn, type ChildProcess } from "node:child_process";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  let caffeinateProcess: ChildProcess | null = null;
  let activeAgents = 0;

  function startCaffeinate(ctx: ExtensionContext) {
    activeAgents++;
    if (caffeinateProcess) return; // Already running

    try {
      // -w: keep system awake while the given PID is alive
      // $$ = our own PID, so when we kill the process, mac can sleep again
      caffeinateProcess = spawn("caffeinate", ["-w", String(process.pid)], {
        stdio: ["ignore", "ignore", "ignore"],
      });

      caffeinateProcess.on("error", (err) => {
        ctx.ui.notify(`Failed to start caffeinate: ${err.message}`, "error");
        caffeinateProcess = null;
      });

      ctx.ui.setStatus("caffeinate", "Mac awake");
    } catch (err) {
      ctx.ui.notify(`Failed to start caffeinate: ${(err as Error).message}`, "error");
    }
  }

  function stopCaffeinate(ctx: ExtensionContext) {
    activeAgents--;
    if (activeAgents > 0) return; // Another agent is still working; keep caffeinate alive

    if (!caffeinateProcess) return;

    try {
      caffeinateProcess.kill();
      caffeinateProcess = null;
    } catch {
      // Process may have already exited; ignore
    }

    ctx.ui.setStatus("caffeinate", "");
  }

  pi.on("agent_start", async (_event, ctx) => {
    startCaffeinate(ctx);
  });

  pi.on("agent_end", async (_event, ctx) => {
    stopCaffeinate(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    stopCaffeinate(ctx);
  });
}
