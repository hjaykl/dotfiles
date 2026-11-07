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
//
// Feature reviews (feature workflow, ~/.agents/skills/feature): when Hunk was
// opened with $FEATURE_REVIEW (hunk-open --feature-review <token.json>), the
// review is one chunk revision of a feature. Then:
//   p/quit your notes go to the chunk's reviewer agent (hc send), which answers
//          your questions here in Hunk and turns requested changes into a fix
//          list for the implementer (via the overseer). A copy is saved in
//          .feature/reviews/. Nothing goes to the /hunk-listen socket.
//   A      approve this chunk revision (also in the Extensions menu): written to
//          .feature/inbox/, bound to feature / chunk / round / base..tip; the
//          overseer records it and refuses anything stale.

import type {
  HunkExtensionAPI,
  ExtensionReviewSnapshot,
} from "hunkdiff/extension";
import { execFile, execFileSync } from "node:child_process";
import { connect } from "node:net";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
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

const DIR = join(process.env.XDG_RUNTIME_DIR || "/tmp", "hunk-pi");

// ---- feature reviews --------------------------------------------------------

export interface FeatureToken {
  type: "feature-review";
  featureId: string;
  title?: string;
  chunk: number;
  chunkTitle?: string;
  round: number;
  base: string;
  tip: string;
  nonce: string;
  worktree: string;
  inbox: string;
  sessionFile: string;
  reviewer?: string | null;
  /** hc name of the agent that receives notes: the reviewer, else the implementer. */
  notesTo?: string | null;
  overseer?: string | null;
}

export function loadFeatureToken(path = process.env.FEATURE_REVIEW): FeatureToken | null {
  if (!path) return null;
  try {
    const t = JSON.parse(readFileSync(path, "utf8"));
    if (t?.type !== "feature-review" || !t.featureId || !t.inbox || !t.nonce || !t.tip) return null;
    return t as FeatureToken;
  } catch {
    return null;
  }
}

export type FeatureDecisionKind = "approve";

export interface AgentNote {
  id: string;
  summary: string;
  author?: string;
  path: string;
}

/** Reviewer (agent) notes in the snapshot: the findings the overseer put there. */
export function agentNotesFromSnapshot(snap: ExtensionReviewSnapshot): AgentNote[] {
  const paths = new Map(snap.files.map((f) => [f.fileKey, f.path]));
  return snap.notes
    .filter((n) => n.source === "agent")
    .map((n) => ({ id: n.id, summary: n.summary, author: n.author, path: paths.get(n.fileKey) ?? n.fileKey }));
}

/** Reviewer findings (agent notes tagged [F<n>]) the person has not replied to. */
export function unrepliedFindings(agentNotes: AgentNote[], userNotes: Note[]): AgentNote[] {
  const replied = new Set(userNotes.map((n) => n.parentId).filter(Boolean));
  return agentNotes.filter((a) => /^\s*\[F\d+\]/.test(a.summary) && !replied.has(a.id));
}

export function featureDecision(
  token: FeatureToken,
  decision: FeatureDecisionKind,
  notes: Note[],
  agentNotes: AgentNote[],
  hunkSession: string | null,
  summary?: string,
) {
  return {
    type: "feature-decision",
    id: randomUUID(),
    decision,
    source: "hunk",
    at: new Date().toISOString(),
    featureId: token.featureId,
    chunk: token.chunk,
    round: token.round,
    base: token.base,
    tip: token.tip,
    nonce: token.nonce,
    hunkSession,
    ...(summary ? { summary } : {}),
    notes,
    agentNotes,
  };
}

/** The message the reviewer gets for notes sent with p (or on quit). */
export function featureNotesMessage(token: FeatureToken, notes: Note[], hunkSession: string | null, savedTo: string | null): string {
  // Tagged like hc's own messages: hc sends from Hunk's (non-agent) terminal
  // arrive untagged, and role agents only accept tagged input (they refuse
  // the person's typing: the overseer is the person's contact).
  const lines = [
    `<hunk-notes chunk="${token.chunk}" round="${token.round}" session="${hunkSession ?? "unknown"}">`,
    `Hunk notes from the person on chunk ${token.chunk}${token.chunkTitle ? ` "${token.chunkTitle}"` : ""} (${token.base.slice(0, 8)}..${token.tip.slice(0, 8)}), round ${token.round}, Hunk session ${hunkSession ?? "unknown"}${savedTo ? `. Saved: ${savedTo}` : ""}`,
    "",
  ];
  notes.forEach((n, i) => {
    const where = [range("new", n.newRange), range("old", n.oldRange)].filter(Boolean).join(" ");
    const updated = sent.has(n.id) ? " (updated)" : "";
    lines.push(`${i + 1}. [${n.id}]${updated} ${n.path}${where ? ` ${where}` : ""}`);
    if (n.parentId) {
      const parent = summaries.get(n.parentId);
      const who = authors.get(n.parentId);
      lines.push(`   reply to [${n.parentId}]${who ? ` (${who})` : ""}${parent ? `: "${parent.replace(/\s+/g, " ").slice(0, 200)}"` : ""}`);
    }
    for (const l of n.body.split("\n")) lines.push(`   ${l}`);
  });
  lines.push(
    "",
    "As this chunk's reviewer: answer every question in Hunk (feature reply <note id> --text \"...\"); put every change the person asks for " +
      `in .feature/reviews/c${token.chunk}-r${token.round}-fixes.md (never drop one; add precision or disagree with reasons); ` +
      "say in Hunk what you are sending for fixing; then report to the overseer in one line.",
    "</hunk-notes>",
  );
  return lines.join("\n");
}

const HC = process.env.FEATURE_HC_BIN || "hc";

/** Save a copy in .feature/reviews/ and hand the notes to the reviewer. */
export function deliverFeatureNotes(token: FeatureToken, notes: Note[], hunkSession: string | null, sync = false): Promise<{ ok: boolean; error?: string; file: string | null }> {
  let file: string | null = null;
  try {
    const dir = join(token.worktree, ".feature", "reviews");
    mkdirSync(dir, { recursive: true });
    file = join(dir, `c${token.chunk}-r${token.round}-notes-${Date.now()}.json`);
    writeFileSync(file, JSON.stringify({ chunk: token.chunk, round: token.round, base: token.base, tip: token.tip, hunkSession, notes }, null, 2) + "\n");
  } catch {
    file = null;
  }
  const to = token.notesTo ?? token.reviewer;
  if (!to) return Promise.resolve({ ok: false, error: "no reviewer or implementer recorded for this chunk", file });
  const text = featureNotesMessage(token, notes, hunkSession, file);
  if (sync) {
    try {
      execFileSync(HC, ["send", to, text], { timeout: 5000, stdio: "ignore" });
      return Promise.resolve({ ok: true, file });
    } catch (e) {
      return Promise.resolve({ ok: false, error: String(e), file });
    }
  }
  return new Promise((resolve) => {
    execFile(HC, ["send", to, text], { timeout: 10000 }, (err, _out, stderr) =>
      resolve(err ? { ok: false, error: (stderr || String(err)).trim().split("\n").pop(), file } : { ok: true, file }),
    );
  });
}

/** Atomic write into the feature inbox; the overseer's pi picks it up. */
export function writeFeatureInbox(token: FeatureToken, decision: { id: string }): string {
  mkdirSync(token.inbox, { recursive: true });
  const file = join(token.inbox, `${Date.now()}-${decision.id.slice(0, 12)}.json`);
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(decision, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, file);
  return file;
}
const HUNK = basename(process.execPath).startsWith("hunk") ? process.execPath : "hunk";

// Sent notes: id → what was sent, so edits go again (as updates).
const sent = new Map<string, string>();
const signature = (n: Note) => JSON.stringify([n.path, n.oldRange, n.newRange, n.body]);

// Saved user notes seen through events: what quit sends without a snapshot.
const cache = new Map<string, Note>();
// Summaries of every saved note, so replies can quote what they answer.
const summaries = new Map<string, string>();
// Authors of agent notes (reviewer findings, agents' answers).
const authors = new Map<string, string>();

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
    if (n.author && n.source !== "user") authors.set(n.id, n.author);
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
  const feature = loadFeatureToken();
  let decided: FeatureDecisionKind | null = null;

  hunk.on("startup", (e) => {
    cwd = e.cwd;
    void findSession(); // registered by now, usually; retried on send
    void findSessionKey();
    if (feature) void announceSession(feature);
  });

  // Tell the overseer which Hunk session shows this round, so it can put the
  // reviewer's findings in as attributed notes. The daemon may register us a
  // moment after startup: retry for a while.
  async function announceSession(t: FeatureToken) {
    for (let i = 0; i < 40; i++) {
      const s = await findSession();
      if (s) {
        try {
          mkdirSync(join(t.sessionFile, ".."), { recursive: true });
          writeFileSync(t.sessionFile, s.id + "\n");
        } catch {}
        return;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  if (feature) {
    const label = `chunk ${feature.chunk} (${feature.tip.slice(0, 8)})`;

    hunk.registerCommand({ id: "approve", title: `Feature: approve ${label}`, key: "A" }, async (ctx) => {
      if (decided) {
        ctx.notify("Already approved here", "warning");
        return;
      }
      const snap = ctx.review.snapshot();
      const notes = snap ? fromSnapshot(snap) : [...cache.values()];
      const agents = snap ? agentNotesFromSnapshot(snap) : [];
      const open = unrepliedFindings(agents, notes);
      const body = [
        `Round ${feature.round} · ${feature.base.slice(0, 8)}..${feature.tip.slice(0, 8)}`,
        notes.length ? `Your ${notes.length} note(s) are kept with the approval as non-blocking comments: nothing more gets fixed.` : "",
        open.length ? `${open.length} reviewer finding(s) have no reply: approving overrides them.` : "",
      ].filter(Boolean).join("\n");
      const ok = await ctx.dialogs.confirm({ title: `Approve ${label}?`, body, confirmLabel: "approve" });
      if (!ok) return;
      const session = await findSession();
      writeFeatureInbox(feature, featureDecision(feature, "approve", notes, agents, session?.id ?? null));
      markSent(notes);
      decided = "approve";
      ctx.notify(`Approved ${label}: recorded for the overseer`);
    });

  }

  hunk.registerCommand({ id: "send", title: feature ? `Send notes to ${feature.notesTo ?? feature.reviewer ?? "the reviewer"}` : "Send notes to pi", key: "p" }, async (ctx) => {
    const snap = ctx.review.snapshot();
    const notes = unsent(snap ? fromSnapshot(snap) : [...cache.values()]);
    if (notes.length === 0) {
      ctx.notify(feature ? "No new notes to send" : "No new notes to send to pi");
      return;
    }
    if (feature) {
      const session = await findSession();
      const to = feature.notesTo ?? feature.reviewer;
      const r = await deliverFeatureNotes(feature, notes, session?.id ?? null);
      if (!r.ok) {
        ctx.notify(`Couldn't reach ${to ?? "the reviewer"} (${r.error}). Notes saved${r.file ? ` to ${r.file}` : ""}: tell the overseer`, "error");
        return;
      }
      markSent(notes);
      ctx.notify(`Sent ${notes.length} note${notes.length === 1 ? "" : "s"} to ${to}`);
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
    if (feature) {
      // Quitting is never a decision: unsent notes go to the reviewer.
      void deliverFeatureNotes(feature, notes, session?.id ?? null, true);
      markSent(notes);
      return;
    }
    // No time to ask now: use what was found earlier.
    if (!sessionKey) return;
    sendOnQuit(message(notes, cwd, session), sessionKey);
    markSent(notes);
  });
}
