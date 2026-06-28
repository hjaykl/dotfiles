/**
 * tool-runner: shared abstraction for running "tool calls" in the background.
 *
 * A "tool call" is any command run in a new background tmux tab (same tmux
 * session, new window, focus never switched). Two flavours:
 *   - a raw CLI command (e.g. `curl ...`, `node script.mjs`, `rg ...`)
 *   - a pi subagent (which is itself just the CLI command `pi --mode print`)
 *
 * Model:
 *   - Every tool call lives in a deterministic directory derived from its id:
 *       ${BASE}/${id}/
 *         run.sh        the spawn script
 *         live.log      streamed stdout+stderr (for tmux/live progress spying)
 *         wrapup.md     OPTIONAL deliberate summary written by the call itself
 *         result.done   FINAL output, published atomically on completion
 *         meta.json     { id, kind, name, command, cwd, startedAt }
 *         task.txt      (subagents only) the task prompt
 *   - Completion is determined SOLELY by the existence of result.done.
 *   - The FINAL output is ALWAYS read from result.done.
 *   - tmux (capture-pane) / live.log are ONLY used for live progress.
 *
 * Wrap-up / return values:
 *   - A spawned call may produce a deliberate "return value" by writing a
 *     summary to wrapup.md (path exposed as $PI_WRAPUP_FILE in its env).
 *   - On completion the script publishes wrapup.md -> result.done if present,
 *     else it falls back to the raw live.log. result.done is written ONLY
 *     after the process exits, so writing wrapup.md mid-run never races the
 *     parent's poller. This is what makes a subagent session behave like a
 *     single tool call: its wrap-up summary IS its return value, so agents
 *     nest arbitrarily.
 *
 * Because the directory is keyed by the caller's id (typically the pi
 * toolCallId), monitoring is trivial and reliable across extensions and even
 * across pi restarts: getToolCall(id) just reads ${BASE}/${id}/meta.json.
 */

import { execSync } from "node:child_process";
import {
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
  watch,
  type FSWatcher,
} from "node:fs";
import { basename, join } from "node:path";

export const DEFAULT_BASE = "/tmp/pi-tool-calls";

export type ToolCallKind = "command" | "subagent";

export interface ToolCall {
  id: string;
  kind: ToolCallKind;
  name: string; // tmux window name
  command: string;
  cwd: string;
  dir: string;
  scriptFile: string;
  liveLog: string;
  wrapupFile: string;
  doneFile: string;
  metaFile: string;
  startedAt: number;
}

interface Meta {
  id: string;
  kind: ToolCallKind;
  name: string;
  command: string;
  cwd: string;
  startedAt: number;
}

/** POSIX-safe single-quote a string for embedding in a shell command. */
export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

export function isInsideTmux(): boolean {
  return !!process.env.TMUX;
}

function tmuxSocket(): string {
  const t = process.env.TMUX;
  if (!t) return "";
  return t.split(",")[0];
}

/** Run a tmux subcommand against the current socket. */
function tmux(args: string): string {
  const sock = tmuxSocket();
  const cmd = sock ? `tmux -S "${sock}" ${args}` : `tmux ${args}`;
  return execSync(cmd, { encoding: "utf-8" }).trim();
}

function currentSession(): string {
  return tmux("display-message -p '#S'");
}

function findWindowIndex(name: string): number | null {
  try {
    const session = currentSession();
    const out = tmux(`list-windows -t "${session}" -F "#{window_index} #{window_name}"`);
    for (const line of out.split("\n")) {
      const sep = line.indexOf(" ");
      if (sep < 0) continue;
      const idx = line.slice(0, sep);
      const wName = line.slice(sep + 1);
      if (wName === name) return parseInt(idx, 10);
    }
  } catch {
    // tmux unavailable
  }
  return null;
}

/** Capture the live tmux pane for a tool call's window (progress only). */
export function capturePane(name: string, lines = 100): string {
  const idx = findWindowIndex(name);
  if (idx == null) return "";
  try {
    const session = currentSession();
    return tmux(`capture-pane -t "${session}:${idx}" -p -S -${lines}`);
  } catch {
    return "";
  }
}

function paths(base: string, id: string) {
  const dir = join(base, sanitizeId(id));
  return {
    dir,
    scriptFile: join(dir, "run.sh"),
    liveLog: join(dir, "live.log"),
    wrapupFile: join(dir, "wrapup.md"),
    doneFile: join(dir, "result.done"),
    metaFile: join(dir, "meta.json"),
  };
}

/** Reconstruct a ToolCall handle from disk by id. Undefined if unknown. */
export function getToolCall(id: string, base = DEFAULT_BASE): ToolCall | undefined {
  const p = paths(base, id);
  if (!existsSync(p.metaFile)) return undefined;
  try {
    const meta = JSON.parse(readFileSync(p.metaFile, "utf-8")) as Meta;
    return {
      ...p,
      id: meta.id,
      kind: meta.kind,
      name: meta.name,
      command: meta.command,
      cwd: meta.cwd,
      startedAt: meta.startedAt,
    };
  } catch {
    return undefined;
  }
}

/** Completion is determined SOLELY by the existence of result.done. */
export function isDone(call: ToolCall): boolean {
  return existsSync(call.doneFile);
}

/** FINAL output is ALWAYS read from result.done. */
export function readResult(call: ToolCall): string {
  if (existsSync(call.doneFile)) {
    return readFileSync(call.doneFile, "utf-8").trim() || "[Empty output]";
  }
  return "[No result yet — still running]";
}

/** Live progress only: prefer the tmux pane, fall back to the live log. */
export function readProgress(call: ToolCall, lines = 100): string {
  const pane = capturePane(call.name, lines).trim();
  if (pane) return pane;
  if (existsSync(call.liveLog)) {
    const content = readFileSync(call.liveLog, "utf-8");
    return content.split("\n").slice(-lines).join("\n").trim() || "[No output yet]";
  }
  return "[No output yet]";
}

/** Wait until result.done appears (or timeout). Returns true if completed. */
export async function waitForToolCall(
  call: ToolCall,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (signal?.aborted) return isDone(call);
    if (isDone(call)) return true;
    await new Promise((r) => setTimeout(r, 800));
  }
  return isDone(call);
}

/**
 * Subscribe to a tool call's completion: invoke `onDone(call)` exactly once
 * when result.done appears. Returns a disposer that cancels the subscription.
 *
 * This is the event-driven counterpart to waitForToolCall's polling loop. It
 * lets a spawning agent register interest and be notified (e.g. woken back up)
 * the moment a subagent finishes, instead of having to block or poll.
 *
 * Implementation notes:
 *   - We watch the call DIRECTORY (the .done file does not exist yet), and
 *     also poll on a slow interval as a safety net, because fs.watch is not
 *     reliable on every platform/filesystem (notably some macOS + network FS).
 *   - onDone fires at most once; the disposer is idempotent.
 *   - If the call is already done when we subscribe, onDone fires on the next
 *     tick so callers can treat subscription uniformly.
 */
export function watchToolCall(
  call: ToolCall,
  onDone: (call: ToolCall) => void,
  pollMs = 1500,
): () => void {
  let fired = false;
  let watcher: FSWatcher | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;

  const dispose = () => {
    if (watcher) {
      try {
        watcher.close();
      } catch {
        /* ignore */
      }
      watcher = undefined;
    }
    if (timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };

  const fire = () => {
    if (fired) return;
    if (!isDone(call)) return;
    fired = true;
    dispose();
    try {
      onDone(call);
    } catch {
      /* swallow: a notification failure must not crash the watcher */
    }
  };

  // Safety-net poll (handles fs.watch gaps and the already-done case).
  timer = setInterval(fire, pollMs);

  // Event-driven fast path: watch the dir for result.done creation.
  try {
    const doneName = basename(call.doneFile);
    watcher = watch(call.dir, (_eventType, filename) => {
      if (!filename || filename === doneName) fire();
    });
  } catch {
    // Directory watch unavailable; the poll above still covers us.
  }

  // If it already completed before we subscribed, fire on next tick.
  if (isDone(call)) setTimeout(fire, 0);

  return dispose;
}

export interface SpawnOptions {
  /** Unique id — typically the pi toolCallId. Determines the directory. */
  id: string;
  /** The shell command to run in the background. */
  command: string;
  /** tmux window name (default derived from kind + id). */
  name?: string;
  /** Working directory (default: process.cwd()). */
  cwd?: string;
  kind?: ToolCallKind;
  base?: string;
  /** Seconds the window lingers after completion (default 5). */
  closeDelaySeconds?: number;
  /**
   * When true, run the command directly attached to the tmux pane's TTY
   * instead of piping through `tee`. Required for interactive TUIs (e.g.
   * interactive pi) which need a real terminal and whose redraw stream is not
   * worth capturing. live progress then comes from capturePane only, and
   * result.done must come from the wrap-up file (no live.log fallback).
   */
  tty?: boolean;
}

/**
 * Spawn a CLI command in a new background tmux window.
 * Streams output to live.log (for spying) and publishes the final output
 * atomically to result.done on completion.
 */
export function spawnToolCall(opts: SpawnOptions): ToolCall {
  if (!isInsideTmux()) {
    throw new Error(
      "tool-runner requires running inside tmux. Start tmux first, then run pi.",
    );
  }

  const base = opts.base ?? DEFAULT_BASE;
  const cwd = opts.cwd ?? process.cwd();
  const kind = opts.kind ?? "command";
  const closeDelay = opts.closeDelaySeconds ?? 5;
  const tty = opts.tty ?? false;
  const p = paths(base, opts.id);
  mkdirSync(p.dir, { recursive: true });

  const name = opts.name ?? `${kind}-${sanitizeId(opts.id)}`;
  const q = shellQuote;

  // How the command runs + how its output is captured:
  //   - piped (default): tee stdout+stderr to live.log for spying, then
  //     publish wrapup.md if present, else fall back to the raw live.log.
  //   - tty (interactive TUIs): run attached to the pane's terminal (no pipe,
  //     so the TUI renders); live progress comes from capturePane, and
  //     result.done MUST come from wrapup.md (no meaningful stdout to fall
  //     back to). If the subagent never wrote a wrap-up, record a clear note.
  const runAndPublish = tty
    ? [
        // Run directly on the pane TTY so the interactive UI works.
        "{ " + opts.command + " ; }",
        "if [ -s " + q(p.wrapupFile) + " ]; then",
        "  cp " + q(p.wrapupFile) + " " + q(p.doneFile + ".tmp"),
        "else",
        '  printf "%s\\n" "[subagent ended without writing a wrap-up summary]" > ' +
          q(p.doneFile + ".tmp"),
        "fi",
      ]
    : [
        // Run command; tee stdout+stderr to the live log for tmux spying.
        "{ " + opts.command + " ; } 2>&1 | tee " + q(p.liveLog),
        // Prefer an explicit wrap-up summary; fall back to the raw streamed log.
        "if [ -s " + q(p.wrapupFile) + " ]; then",
        "  cp " + q(p.wrapupFile) + " " + q(p.doneFile + ".tmp"),
        "else",
        "  cp " + q(p.liveLog) + " " + q(p.doneFile + ".tmp"),
        "fi",
      ];

  // NOTE: built with string concatenation (NOT JS template literals) so that
  // shell `$(...)` substitutions in the command are preserved verbatim.
  const script = [
    "#!/usr/bin/env bash",
    "cd " + q(cwd),
    // Expose the call's dir + wrap-up target so the process (e.g. a pi
    // subagent + the wrap-up skill) can publish a deliberate return value.
    "export PI_TOOL_CALL_DIR=" + q(p.dir),
    "export PI_WRAPUP_FILE=" + q(p.wrapupFile),
    "set -o pipefail",
    ...runAndPublish,
    // Publish the final output atomically: existence of result.done == done.
    "mv " + q(p.doneFile + ".tmp") + " " + q(p.doneFile),
    'echo "--- COMPLETED — window closes in ' + closeDelay + 's ---"',
    "sleep " + closeDelay,
    "",
  ].join("\n");
  writeFileSync(p.scriptFile, script, { mode: 0o755 });

  const meta: Meta = {
    id: opts.id,
    kind,
    name,
    command: opts.command,
    cwd,
    startedAt: Date.now(),
  };
  writeFileSync(p.metaFile, JSON.stringify(meta, null, 2));

  const session = currentSession();
  // -d: create the window in the background without switching focus.
  tmux(
    `new-window -d -t ${q(session)} -n ${q(name)} -c ${q(cwd)} ${q(p.scriptFile)}`,
  );

  return {
    ...p,
    id: opts.id,
    kind,
    name,
    command: opts.command,
    cwd,
    startedAt: meta.startedAt,
  };
}

export interface SubagentOptions {
  id: string;
  task: string;
  name?: string;
  cwd?: string;
  base?: string;
  /** Extra args passed to `pi` (e.g. ["--model", "..."]). */
  piArgs?: string[];
  /**
   * Run the subagent in interactive mode (default true) so a human can watch
   * the stream live in its tmux window, interrupt it, and reprompt. The
   * subagent is shut down automatically (via the tmux-subagents agent_end
   * handler) after it writes its wrap-up summary; completion is still
   * signalled by result.done (published once pi exits). Set false to fall
   * back to non-interactive `--mode print`.
   */
  interactive?: boolean;
}

/**
 * Spawn a pi subagent — a tool call backed by a real pi session.
 *
 * Either way, the subagent's RESULT is its wrap-up summary (wrapup.md), which
 * the wrapper publishes to result.done. The two modes differ only in how the
 * session is driven and how completion happens:
 *
 *   - interactive (default): a full TUI pi you can watch/steer in the tmux
 *     window. The task is the initial prompt; the subagent auto-shuts-down
 *     after wrapping up. result.done appears when pi exits.
 *   - print: headless `pi --mode print`, which exits on its own.
 *
 * In BOTH modes completion == result.done existing, so wait/check are
 * unchanged. Interactive stdout (TUI redraws) is noisy, so result.done should
 * come from wrapup.md; the live.log fallback would be ugly for interactive.
 */
export function spawnSubagent(opts: SubagentOptions): ToolCall {
  const base = opts.base ?? DEFAULT_BASE;
  const interactive = opts.interactive ?? true;
  const p = paths(base, opts.id);
  mkdirSync(p.dir, { recursive: true });

  // Write the task to a file to avoid all shell-quoting issues.
  // Append a wrap-up directive so the subagent produces a clean return value
  // (its summary in wrapup.md) rather than leaking its raw transcript. The
  // wrap-up file path is inlined so the subagent needs no env resolution.
  const taskFile = join(p.dir, "task.txt");
  // No "type /quit" instruction: the model can emit that text but cannot
  // submit it (press Enter). Interactive subagents are shut down automatically
  // by the tmux-subagents extension's agent_end handler once a turn finishes.
  const wrapupDirective = [
    "",
    "",
    "---",
    "You are running as a spawned subagent: a single background tool call for a",
    "calling agent. When you have finished the task above, use the `wrap-up`",
    "skill to write a concise, self-contained summary of the outcome to:",
    "",
    "  " + p.wrapupFile,
    "",
    "That summary is the ONLY thing the calling agent receives as your result.",
    "Include key findings/answers, any files created or changed (with paths),",
    "blockers, and follow-ups. Do not assume the caller can see your work.",
    "",
    "You run in an interactive session: if you need clarification or a decision,",
    "just ask the user and wait — the session stays open. You decide when you",
    "are done. Writing the wrap-up file is your signal that you have finished;",
    "once you write it, simply stop and the session ends automatically, returning",
    "your summary to the caller. So do not write the wrap-up file until the task",
    "is actually complete.",
  ].join("\n");
  writeFileSync(taskFile, opts.task + wrapupDirective);

  const extra = (opts.piArgs ?? []).map(shellQuote).join(" ");
  // Interactive: task is the initial prompt to a full TUI session.
  // Print: headless one-shot that exits on its own.
  const command = interactive
    ? "pi " +
      (extra ? extra + " " : "") +
      '"$(cat ' +
      shellQuote(taskFile) +
      ')"'
    : "pi --mode print " +
      (extra ? extra + " " : "") +
      '"$(cat ' +
      shellQuote(taskFile) +
      ')"';

  return spawnToolCall({
    id: opts.id,
    command,
    name: opts.name ?? `subagent-${sanitizeId(opts.id)}`,
    cwd: opts.cwd,
    kind: "subagent",
    base,
    // Interactive pi is a TUI: attach it to the pane TTY, don't pipe it.
    tty: interactive,
  });
}
