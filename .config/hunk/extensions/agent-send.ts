// Send your Hunk review notes to a coding agent (Claude Code, pi, ...) in
// this Rex session, by pasting them into its prompt with ~/.bin/rex-agent.
//
// Which agent: the session's listener (set by ~/.bin/hunk-listen, the
// agents' /hunk-listen or cmd+shift+h); with none, the only agent in the
// session. Two or more and no listener: an error saying to pick one.
//
//   p      send notes not sent yet, or edited since (also in the Extensions menu)
//   quit   anything still unsent goes automatically
//
// rex-agent holds a send while Claude Code's prompt has a draft. A send that
// fails, or one Hunk quit before finishing, stays as a file in
// <dir>/<key>.pending/ (dir: $XDG_RUNTIME_DIR or /tmp, /hunk-notes); the next
// Hunk start or `hunk-listen` delivers it.
//
// Each note goes with its id, file, side and line range; replies quote the
// note they answer. The agent is asked to answer each in Hunk with
// `hunk session comment add <session-id> --reply-to <id>` (hunk-review skill).
// The session id (not --repo) keeps that working when several Hunk sessions
// review the same repo.
//
import type {
  HunkExtensionAPI,
  ExtensionReviewSnapshot,
} from "hunkdiff/extension";
import { execFile, spawn } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, basename } from "node:path";

type Range = readonly [number, number];

export interface Note {
  id: string;
  parentId?: string;
  path: string;
  oldRange?: Range;
  newRange?: Range;
  body: string;
}

interface Session {
  id: string;
  title?: string;
}

const DIR = join(process.env.XDG_RUNTIME_DIR || "/tmp", "hunk-notes");

const HUNK = basename(process.execPath).startsWith("hunk") ? process.execPath : "hunk";
const REX_AGENT = join(homedir(), ".bin", "rex-agent");

// Sent notes: id → what was sent, so edits go again (as updates).
const sent = new Map<string, string>();
const signature = (n: Note) => JSON.stringify([n.path, n.oldRange, n.newRange, n.body]);

// Saved user notes seen through events: what quit sends without a snapshot.
const cache = new Map<string, Note>();
// Summaries of every saved note, so replies can quote what they answer.
const summaries = new Map<string, string>();

// This Hunk's live session: the daemon lists sessions with their pid.
let session: Session | null = null;
function findSession(): Promise<Session | null> {
  if (session) return Promise.resolve(session);
  return new Promise((resolve) => {
    execFile(HUNK, ["session", "list", "--json"], { timeout: 3000 }, (err, stdout) => {
      if (err) return resolve(null);
      try {
        const list = JSON.parse(stdout).sessions ?? [];
        const mine = list.find((s: { pid?: number }) => s.pid === process.pid);
        if (mine?.sessionId) session = { id: mine.sessionId, title: mine.title };
      } catch {}
      resolve(session);
    });
  });
}

export function fromSnapshot(snap: ExtensionReviewSnapshot): Note[] {
  const paths = new Map(snap.files.map((f) => [f.fileKey, f.path]));
  for (const n of snap.notes) {
    summaries.set(n.id, n.summary);
  }
  return snap.notes
    .filter((n) => n.source === "user" && n.resolution !== "orphaned")
    .map((n) => ({
      id: n.id,
      parentId: n.parentId,
      path: paths.get(n.fileKey) ?? n.fileKey,
      oldRange: n.anchor.oldRange,
      newRange: n.anchor.newRange,
      body: [n.summary, n.rationale].filter(Boolean).join("\n\n"),
    }));
}

const range = (side: string, r?: Range) =>
  r ? `${side}:${r[0] === r[1] ? r[0] : `${r[0]}-${r[1]}`}` : null;

export function message(notes: Note[], repo: string, s: Session | null): string {
  const target = s ? s.id : `--repo ${repo}`;
  const head = s?.title ? `"${s.title}"` : repo;
  const lines = [
    `Review notes from Hunk (${head}, session ${s?.id ?? "unknown"}, repo ${repo}):`,
    "",
  ];
  notes.forEach((n, i) => {
    const where = [range("new", n.newRange), range("old", n.oldRange)].filter(Boolean).join(" ");
    const updated = sent.has(n.id) ? " (updated)" : "";
    lines.push(`${i + 1}. [${n.id}]${updated} ${n.path}${where ? ` ${where}` : ""}`);
    if (n.parentId) {
      const parent = summaries.get(n.parentId);
      lines.push(`   reply to [${n.parentId}]${parent ? `: "${parent.replace(/\s+/g, " ").slice(0, 200)}"` : ""}`);
    }
    for (const l of n.body.split("\n")) lines.push(`   ${l}`);
    lines.push("");
  });
  lines.push(
    "Address each note. Then answer each one in Hunk (hunk-review skill): " +
      `\`hunk session comment add ${target} --reply-to <id> --summary "..."\`.`,
  );
  return lines.join("\n");
}

// ---- delivery (rex-agent) ----------------------------------------------------

const ENV = { ...process.env, HOME: homedir() };

function run(cmd: string, args: string[], timeoutMs: number): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, env: ENV, encoding: "utf8", maxBuffer: 8 << 20 }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as { code?: unknown }).code === "number" ? ((err as { code: number }).code) : 1) : 0;
      resolve({ code, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

// This Rex session ("rex-<session id>", ~/.bin/lib/nvim-session.sh).
let sessionKey: string | null = null;
async function findSessionKey(): Promise<string | null> {
  if (sessionKey) return sessionKey;
  const r = await run("bash", ["-c", '. "$HOME/.bin/lib/nvim-session.sh" && nvs_key'], 3000);
  const key = r.stdout.trim();
  if (r.code === 0 && key.startsWith("rex-")) sessionKey = key;
  return sessionKey;
}

export interface Target { address: string; label: string }

// The last target found, for quit (no time to ask then).
let target: Target | null = null;
async function findTarget(): Promise<Target | { error: string }> {
  if (!(await findSessionKey())) return { error: "Not in a Rex session: no agent to send to" };
  const r = await run(REX_AGENT, ["target"], 15_000);
  const block = r.stdout.trim();
  const t = r.code === 0 && block
    ? { address: block, label: `agent ${block.slice(-6)}` }
    : { error: r.stderr.trim() || "No agent to send to" };
  target = "error" in t ? null : t;
  return t;
}

/** Paste the notes into the agent's prompt. Resolves with an error text, or null when sent. */
async function send(to: Target, text: string): Promise<string | null> {
  const file = join(DIR, `send-${Date.now()}-${process.pid}.txt`);
  try {
    mkdirSync(DIR, { recursive: true, mode: 0o700 });
    writeFileSync(file, text, { mode: 0o600 });
  } catch {
    return "Could not write the notes to a file";
  }
  // Long timeout: rex-agent holds the send while a draft is being typed.
  const r = await run(REX_AGENT, ["send", to.address, file], 15 * 60_000);
  try { unlinkSync(file); } catch {}
  return r.code === 0 ? null : `${to.label}: ${r.stderr.trim() || "rex-agent send failed"}`;
}

// ---- pending copies ----------------------------------------------------------

const pendingDir = (key: string) => join(DIR, `${key}.pending`);

function savePending(key: string, text: string): string | null {
  const file = join(pendingDir(key), `${Date.now()}-${process.pid}.txt`);
  try {
    mkdirSync(pendingDir(key), { recursive: true, mode: 0o700 });
    writeFileSync(file, text, { mode: 0o600 });
    return file;
  } catch {
    return null;
  }
}

/** Deliver reviews left behind by an earlier Hunk (older than a minute: not one in flight). */
async function flushPending(): Promise<void> {
  const key = await findSessionKey();
  if (!key) return;
  let files: string[] = [];
  try {
    files = readdirSync(pendingDir(key)).filter((f) => f.endsWith(".txt")).sort().map((f) => join(pendingDir(key), f));
  } catch { return; }
  for (const f of files) {
    try {
      if (Date.now() - statSync(f).mtimeMs < 60_000) continue;
      const text = readFileSync(f, "utf8");
      const to = await findTarget();
      if ("error" in to) return;
      if (!text.trim() || (await send(to, text)) === null) unlinkSync(f);
    } catch {}
  }
}

// Quit: keep a pending copy, then hand it to a detached rex-agent that
// outlives us and removes the copy once it is delivered.
function sendOnQuit(text: string, key: string, to: Target | null) {
  const file = savePending(key, text);
  if (!file || !to) return;
  try {
    spawn("/bin/sh", ["-c", '"$3" send "$1" "$2" >/dev/null 2>&1 && rm -f "$2"', "sh", to.address, file, REX_AGENT],
      { detached: true, stdio: "ignore", env: ENV }).unref();
  } catch {}
}

const unsent = (notes: Note[]) => notes.filter((n) => n.body.trim() && sent.get(n.id) !== signature(n));
const markSent = (notes: Note[]) => notes.forEach((n) => sent.set(n.id, signature(n)));

export default function (hunk: HunkExtensionAPI) {
  let cwd = process.cwd();

  hunk.on("startup", (e) => {
    cwd = e.cwd;
    void findSession(); // registered by now, usually; retried on send
    void findTarget().then(() => flushPending());
  });

  hunk.registerCommand({ id: "send", title: "Send notes to agent", key: "p" }, async (ctx) => {
    const snap = ctx.review.snapshot();
    const notes = unsent(snap ? fromSnapshot(snap) : [...cache.values()]);
    if (notes.length === 0) {
      ctx.notify("No new notes to send");
      return;
    }
    const to = await findTarget();
    if ("error" in to) {
      ctx.notify(to.error, "error");
      return;
    }
    const text = message(notes, ctx.cwd, await findSession());
    // Marked now so a second `p` or quit doesn't send them again while
    // rex-agent holds this send for a draft; unmarked again if it fails.
    const before = notes.map((n) => [n.id, sent.get(n.id)] as const);
    markSent(notes);
    const count = `${notes.length} note${notes.length === 1 ? "" : "s"}`;
    ctx.notify(`Sending ${count} to ${to.label}…`);
    // rex-agent holds the send while you are typing in the agent: say so.
    const d = await run(REX_AGENT, ["draft", to.address], 5000);
    if (d.stdout.trim()) ctx.notify(`Waiting: you are typing in ${to.label}. The notes go once you send or clear that.`);
    const error = await send(to, text);
    if (error) {
      for (const [id, sig] of before) sig === undefined ? sent.delete(id) : sent.set(id, sig);
      ctx.notify(error, "error");
      return;
    }
    ctx.notify(`Sent ${count} to ${to.label}`);
  });

  // Keep the cache of saved user notes current.
  const remember = (n: {
    id: string; parentId?: string; filePath: string; oldRange?: Range; newRange?: Range; body: string; draft: boolean;
  }) => {
    if (n.draft) return;
    void findSession(); // so quit knows these without waiting
    void findTarget();
    cache.set(n.id, {
      id: n.id, parentId: n.parentId, path: n.filePath, oldRange: n.oldRange, newRange: n.newRange, body: n.body,
    });
  };
  hunk.on("note_created", ({ note }) => remember(note));
  hunk.on("note_edited", ({ note }) => remember(note));
  hunk.on("note_changed", ({ kind, note }) => {
    if (kind === "removed") {
      cache.delete(note.id);
      summaries.delete(note.id);
      sent.delete(note.id);
    } else {
      summaries.set(note.id, note.summary);
    }
  });

  hunk.on("shutdown", () => {
    const notes = unsent([...cache.values()]);
    if (notes.length === 0) return;
    // No time to ask now: use what was found earlier.
    if (!sessionKey) return;
    sendOnQuit(message(notes, cwd, session), sessionKey, target);
    markSent(notes);
  });
}
