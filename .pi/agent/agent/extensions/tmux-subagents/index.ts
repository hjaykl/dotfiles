/**
 * tmux-subagents: run background "tool calls" in separate tmux tabs.
 *
 * Thin extension layer over ../lib/tool-runner.ts. Provides:
 *   - spawn_subagent : run a pi subagent in a background tmux tab
 *   - run_command    : run an arbitrary CLI command in a background tmux tab
 *   - check_tool_call: peek at status/progress (final output from .done)
 *   - wait_tool_call : block until done, return final output from .done
 *
 * All three flavours share one model: each call gets a deterministic dir
 * keyed by its toolCallId, completion == existence of result.done, and the
 * final output is ALWAYS read from result.done. tmux is only for live spying.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { execSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import {
  isInsideTmux,
  spawnSubagent,
  spawnToolCall,
  getToolCall,
  isDone,
  readResult,
  readProgress,
  waitForToolCall,
  watchToolCall,
  type ToolCall,
} from "../lib/tool-runner.ts";
import { renderCallText, renderCollapsibleResult, resultText } from "../lib/render.ts";

function text(s: string) {
  return { content: [{ type: "text" as const, text: s }] };
}

/**
 * Turn a tmux window name / kind into a friendly phrase describing what a
 * background call is doing, e.g. "web search", "subagent", "a command".
 */
function describeName(name: string | undefined, kind?: string): string {
  if (name?.startsWith("web-search")) {
    const q = name.replace(/^web-search-?/, "").replace(/-+/g, " ").trim();
    return q ? `web search for “${q}”` : "web search";
  }
  if (kind === "subagent" || name?.startsWith("subagent")) return "a subagent";
  return "a command";
}

/** Friendly description of the call referenced by a wait/check toolCallId. */
function describeTarget(toolCallId: string | undefined): string {
  if (!toolCallId) return "a background task";
  const call = getToolCall(toolCallId);
  if (!call) return "a background task";
  return describeName(call.name, call.kind);
}

export default function (pi: ExtensionAPI) {
  // Are WE running as a spawned interactive subagent? The parent sets
  // PI_WRAPUP_FILE when launching us. If so, an interactive pi never exits on
  // its own, so we must shut ourselves down once our work is genuinely done.
  // Asking the model to "type /quit" is unreliable (it can emit the text but
  // cannot press Enter to submit it), so we drive shutdown programmatically —
  // but only after the subagent signals completion by writing its wrap-up
  // file. The subagent stays alive across turns and may pause to ask the user.
  const wrapupFile = process.env.PI_WRAPUP_FILE;
  const isSpawnedSubagent = !!wrapupFile;

  pi.on("session_start", async (_event, ctx) => {
    if (isSpawnedSubagent) {
      ctx.ui.notify(
        "Running as a spawned subagent — ask the user anything you need; the " +
          "session auto-quits once you write your wrap-up summary.",
        "info",
      );
      return;
    }
    ctx.ui.notify(
      "tmux tool-runner loaded (spawn_subagent, run_command, check_tool_call, wait_tool_call)",
      "info",
    );
  });

  // Auto-shutdown: a spawned subagent exits ONLY when it has signalled that it
  // is genuinely done — i.e. it has written its wrap-up summary. We must NOT
  // quit just because a turn ended: the subagent is trusted to decide when it
  // is finished, and it may legitimately end a turn to ask the user a question
  // and wait for input. So we gate shutdown on the wrap-up file existing
  // (and being non-empty) rather than on agent_end alone.
  //
  // To avoid quitting on a stale file from a previous run, we only honour a
  // wrap-up written AFTER this session started.
  if (isSpawnedSubagent && wrapupFile) {
    const startedAt = Date.now();
    const wroteWrapup = (): boolean => {
      try {
        if (!existsSync(wrapupFile)) return false;
        const st = statSync(wrapupFile);
        return st.size > 0 && st.mtimeMs >= startedAt - 1000;
      } catch {
        return false;
      }
    };

    pi.on("agent_end", async (_event, ctx) => {
      if (ctx.hasPendingMessages?.()) return; // let queued steering finish first
      if (!wroteWrapup()) return; // not done yet (e.g. paused to ask the user)
      // Done: ctx.shutdown() in interactive mode defers until idle and emits
      // session_shutdown, so the wrapper script publishes wrapup.md ->
      // result.done and the calling agent is notified.
      ctx.shutdown();
    });
  }

  // --- completion subscriptions ----------------------------------------------
  // The PARENT side: when this session spawns a background tool call, it
  // subscribes to that call's result.done. The moment the result lands, we
  // nudge the agent back awake with the result, so the parent never has to
  // block in wait_tool_call or remember to poll. This is what makes spawning
  // feel asynchronous: fire off N subagents, go idle, and get woken per result.
  const disposers = new Set<() => void>();

  function subscribeToCompletion(call: ToolCall) {
    const dispose = watchToolCall(call, (done) => {
      disposers.delete(dispose);
      const who = done.kind === "subagent" ? "Subagent" : "Background command";
      // deliverAs/triggerTurn: if the agent is mid-stream, queue as a follow-up
      // (delivered when it next goes idle); if it's idle, triggerTurn wakes it.
      pi.sendMessage(
        {
          customType: "tmux-subagents:completion",
          content:
            `${who} "${done.name}" (toolCallId=${done.id}) has completed.\n\n` +
            `Result:\n${readResult(done)}`,
          display: true,
          details: { toolCallId: done.id, name: done.name, kind: done.kind },
        },
        { deliverAs: "followUp", triggerTurn: true },
      );
    });
    disposers.add(dispose);
  }

  pi.on("session_shutdown", async () => {
    for (const dispose of disposers) dispose();
    disposers.clear();
  });

  // --- spawn_subagent --------------------------------------------------------
  pi.registerTool({
    name: "spawn_subagent",
    label: "Spawn Subagent",
    description:
      "Spawn an interactive pi subagent in a new background tmux window (focus is never switched). The window runs a full interactive pi you can switch to, watch stream live, interrupt, and reprompt. The subagent quits after writing its wrap-up summary. Returns immediately; use wait_tool_call / check_tool_call with the toolCallId to retrieve its result.",
    parameters: Type.Object({
      task: Type.String({ description: "The task for the subagent to complete" }),
      name: Type.Optional(
        Type.String({ description: "Name for the tmux window (default: subagent-<id>)" }),
      ),
      interactive: Type.Optional(
        Type.Boolean({
          description:
            "Run as an interactive TUI you can watch/steer (default true). Set false for a headless one-shot run.",
        }),
      ),
    }),
    async execute(toolCallId, params, _signal, _onUpdate, _ctx) {
      if (!isInsideTmux()) {
        return text(
          "Error: spawn_subagent requires running inside tmux. Start tmux first, then run pi.",
        );
      }
      try {
        const interactive = params.interactive ?? true;
        const call = spawnSubagent({
          id: toolCallId,
          task: params.task,
          name: params.name,
          interactive,
        });
        // Wake the parent back up when this subagent finishes.
        subscribeToCompletion(call);
        return text(
          [
            `${interactive ? "Interactive" : "Headless"} subagent spawned in background tmux window "${call.name}".`,
            `Tool call ID: ${toolCallId}`,
            `Result file: ${call.doneFile}`,
            "",
            interactive
              ? `✓ Running interactively — switch to it with: tmux select-window -t "${call.name}"`
              : "✓ Running in background — your current window remains focused.",
            "  Your current window stays focused either way.",
            "",
            "You do NOT need to block on this. You'll be notified automatically when",
            "it completes. Continue with other work, or wait_tool_call if you want to",
            "block now; check_tool_call peeks at live progress.",
          ].join("\n"),
        );
      } catch (err) {
        return text(`Failed to spawn subagent: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    renderCall: renderCallText((a: { task?: string; name?: string }, t) => {
      let s = t.fg("toolTitle", t.bold("Spawning a subagent"));
      const hint = a.name ?? a.task?.slice(0, 50);
      if (hint) s += t.fg("muted", ` — ${hint}`);
      return s;
    }),
    renderResult: renderCollapsibleResult({
      partial: "Spawning subagent…",
      summary: () => "subagent spawned in background",
    }),
  });

  // --- run_command -----------------------------------------------------------
  pi.registerTool({
    name: "run_command",
    label: "Run Command (background)",
    description:
      "Run an arbitrary CLI command in a new background tmux window (focus is never switched). Returns immediately; use wait_tool_call / check_tool_call with the toolCallId to retrieve its output from the .done file.",
    parameters: Type.Object({
      command: Type.String({ description: "The shell command to run" }),
      name: Type.Optional(
        Type.String({ description: "Name for the tmux window (default: command-<id>)" }),
      ),
    }),
    async execute(toolCallId, params, _signal, _onUpdate, _ctx) {
      if (!isInsideTmux()) {
        return text(
          "Error: run_command requires running inside tmux. Start tmux first, then run pi.",
        );
      }
      try {
        const call = spawnToolCall({
          id: toolCallId,
          command: params.command,
          name: params.name,
          kind: "command",
        });
        // Wake the parent back up when this command finishes.
        subscribeToCompletion(call);
        return text(
          [
            `Command spawned in background tmux window "${call.name}".`,
            `Tool call ID: ${toolCallId}`,
            `Result file: ${call.doneFile}`,
            "",
            "✓ Running in background — your current window remains focused.",
            "",
            "You do NOT need to block on this. You'll be notified automatically when",
            "it completes. Continue with other work, or wait_tool_call to block now;",
            "check_tool_call peeks at live progress.",
          ].join("\n"),
        );
      } catch (err) {
        return text(`Failed to run command: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    renderCall: renderCallText((a: { command?: string }, t) => {
      let s = t.fg("toolTitle", t.bold("Running a command"));
      if (a.command) s += t.fg("accent", ` — ${a.command}`);
      return s;
    }),
    renderResult: renderCollapsibleResult({
      partial: "Starting command…",
      summary: () => "command spawned in background",
    }),
  });

  // --- check_tool_call -------------------------------------------------------
  pi.registerTool({
    name: "check_tool_call",
    label: "Check Tool Call",
    description:
      "Check the status of a background tool call (subagent or command). If complete, returns the final output from its .done file; otherwise shows live tmux progress.",
    parameters: Type.Object({
      toolCallId: Type.String({ description: "The tool call ID of the background tool call" }),
    }),
    async execute(_id, params, _signal, _onUpdate, _ctx) {
      const call = getToolCall(params.toolCallId);
      if (!call) {
        return text(`No tool call found with ID: ${params.toolCallId}`);
      }
      if (isDone(call)) {
        return text(
          `Tool call "${call.name}" completed.\n\nOutput (from .done file):\n${readResult(call)}`,
        );
      }
      return text(
        `Tool call "${call.name}" is still running.\n\nLive progress (from tmux, NOT final):\n${readProgress(call)}`,
      );
    },
    renderCall: renderCallText((a: { toolCallId?: string }, t) =>
      t.fg("toolTitle", t.bold("Checking on ")) +
      t.fg("accent", describeTarget(a.toolCallId)),
    ),
    renderResult: renderCollapsibleResult({
      summary: (r) => resultText(r).split("\n")[0] || "checked tool call",
    }),
  });

  // --- wait_tool_call --------------------------------------------------------
  pi.registerTool({
    name: "wait_tool_call",
    label: "Wait for Tool Call",
    description:
      "Block until a background tool call (subagent or command) completes, then return its final output from the .done file.",
    parameters: Type.Object({
      toolCallId: Type.String({ description: "The tool call ID of the background tool call" }),
      timeout: Type.Optional(Type.Number({ description: "Timeout in seconds (default: 300)" })),
    }),
    async execute(_id, params, signal, _onUpdate, _ctx) {
      const call = getToolCall(params.toolCallId);
      if (!call) {
        return text(`No tool call found with ID: ${params.toolCallId}`);
      }
      const timeoutMs = (params.timeout ?? 300) * 1000;
      const completed = await waitForToolCall(call, timeoutMs, signal);

      if (!completed) {
        return text(
          `Tool call "${call.name}" did not complete within ${params.timeout ?? 300}s.\n\nPartial progress (from live log):\n${readProgress(call)}`,
        );
      }
      return text(
        `Tool call "${call.name}" completed.\n\nOutput (from .done file):\n${readResult(call)}`,
      );
    },
    renderCall: renderCallText((a: { toolCallId?: string }, t) =>
      t.fg("toolTitle", t.bold("Waiting for ")) +
      t.fg("accent", describeTarget(a.toolCallId)) +
      t.fg("muted", " to finish"),
    ),
    renderResult: renderCollapsibleResult({
      partial: "Waiting…",
      summary: (r) => {
        const m = resultText(r).match(/Tool call "([^"]+)"/);
        const who = m ? describeName(m[1]) : "the task";
        return resultText(r).includes("completed")
          ? `${who} finished`
          : resultText(r).split("\n")[0] || "tool call finished";
      },
    }),
  });

  // --- /tool-calls command ---------------------------------------------------
  pi.registerCommand("tool-calls", {
    description: "List active background tool-call tmux windows",
    handler: async (_args, ctx) => {
      if (!isInsideTmux()) {
        ctx.ui.notify("Not running inside tmux", "error");
        return;
      }
      try {
        const session = execSync("tmux display-message -p '#S'", {
          encoding: "utf-8",
        }).trim();
        const windows = execSync(
          `tmux list-windows -t "${session}" -F "#{window_index} #{window_name}"`,
          { encoding: "utf-8" },
        ).trim();
        const matches = windows
          .split("\n")
          .filter((l) =>
            /\b(subagent|command|web-search)/.test(l),
          )
          .map((l) => `  ${l}`)
          .join("\n");
        ctx.ui.notify(
          matches ? `Active tool-call windows:\n${matches}` : "No active tool-call windows",
          "info",
        );
      } catch (err) {
        ctx.ui.notify(
          `Failed to list windows: ${err instanceof Error ? err.message : String(err)}`,
          "error",
        );
      }
    },
  });
}
