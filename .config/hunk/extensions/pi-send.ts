// Send your Hunk review notes to the pi that listens for this tmux session /
// Herdr space: the one that ran /hunk-listen (pi extension hunk-listen.ts).
// Its socket is <dir>/<session key>.sock (dir: $XDG_RUNTIME_DIR or /tmp,
// /hunk-pi; key from ~/.bin/lib/nvim-session.sh), so there's no guessing.
//
//   p      send notes not sent yet, or edited since (also in the Extensions menu)
//   quit   anything still unsent goes automatically
//
// Each note goes with its id, file, side and line range; replies quote the
// note they answer. pi is asked to answer each in Hunk with
// `hunk session comment add <session-id> --reply-to <id>` (hunk-review skill).
// The session id (not --repo) keeps that working when several Hunk sessions
// review the same repo.

import type {
  HunkExtensionAPI,
  ExtensionReviewSnapshot,
} from "hunkdiff/extension";
import { execFile } from "node:child_process";
import { connect } from "node:net";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, basename } from "node:path";

type Range = readonly [number, number];

interface Note {
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

const DIR = join(process.env.XDG_RUNTIME_DIR || "/tmp", "hunk-pi");
const HUNK = basename(process.execPath).startsWith("hunk") ? process.execPath : "hunk";

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

function fromSnapshot(snap: ExtensionReviewSnapshot): Note[] {
  const paths = new Map(snap.files.map((f) => [f.fileKey, f.path]));
  for (const n of snap.notes) summaries.set(n.id, n.summary);
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

function message(notes: Note[], repo: string, s: Session | null): string {
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

// This tmux session / Herdr space: names the listener's socket.
let sessionKey: string | null = null;
function findSessionKey(): Promise<string | null> {
  if (sessionKey) return Promise.resolve(sessionKey);
  return new Promise((resolve) => {
    execFile("bash", ["-c", '. "$HOME/.bin/lib/nvim-session.sh" && nvs_key'],
      { timeout: 3000, env: { ...process.env, HOME: homedir() } },
      (err, stdout) => {
        if (!err && stdout.trim()) sessionKey = stdout.trim();
        resolve(sessionKey);
      });
  });
}

// One JSON line to the listener; resolves with its reply, null if nobody listens.
function request(key: string, msg: object, timeoutMs = 1500): Promise<{ ok: boolean; error?: string } | null> {
  return new Promise((resolve) => {
    const c = connect(join(DIR, `${key}.sock`));
    let buf = "";
    const done = (v: { ok: boolean; error?: string } | null) => {
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
        try { done(JSON.parse(buf.slice(0, i))); } catch { done(null); }
      }
    });
  });
}

// Quit: keep a pending copy first (the listener picks it up, or the next
// /hunk-listen offers it), then try to hand it over now.
function sendOnQuit(text: string, key: string) {
  const dir = join(DIR, `${key}.pending`);
  const file = join(dir, `${Date.now()}-${process.pid}.txt`);
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(file, text, { mode: 0o600 });
  } catch {
    return;
  }
  void request(key, { type: "review", text, file }, 200);
}

const unsent = (notes: Note[]) => notes.filter((n) => n.body.trim() && sent.get(n.id) !== signature(n));
const markSent = (notes: Note[]) => notes.forEach((n) => sent.set(n.id, signature(n)));

export default function (hunk: HunkExtensionAPI) {
  let cwd = process.cwd();

  hunk.on("startup", (e) => {
    cwd = e.cwd;
    void findSession(); // registered by now, usually; retried on send
    void findSessionKey();
  });

  hunk.registerCommand({ id: "send", title: "Send notes to pi", key: "p" }, async (ctx) => {
    const snap = ctx.review.snapshot();
    const notes = unsent(snap ? fromSnapshot(snap) : [...cache.values()]);
    if (notes.length === 0) {
      ctx.notify("No new notes to send to pi");
      return;
    }
    const key = await findSessionKey();
    if (!key) {
      ctx.notify("Not in a tmux session or Herdr space: no pi to send to", "error");
      return;
    }
    const reply = await request(key, { type: "review", text: message(notes, ctx.cwd, await findSession()) });
    if (!reply?.ok) {
      ctx.notify(reply ? `pi refused: ${reply.error}` : "No pi is listening here: run /hunk-listen in the pi that should get reviews", "error");
      return;
    }
    markSent(notes);
    ctx.notify(`Sent ${notes.length} note${notes.length === 1 ? "" : "s"} to pi`);
  });

  // Keep the cache of saved user notes current.
  const remember = (n: {
    id: string; parentId?: string; filePath: string; oldRange?: Range; newRange?: Range; body: string; draft: boolean;
  }) => {
    if (n.draft) return;
    void findSession(); // so quit knows these without waiting
    void findSessionKey();
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
    sendOnQuit(message(notes, cwd, session), sessionKey);
    markSent(notes);
  });
}
