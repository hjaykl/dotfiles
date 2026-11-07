// bun test test/pi-send.test.ts (from ~/.dotfiles/.config/hunk) — feature-mode decisions and unchanged ordinary behaviour.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Fake hc: records `hc send <to> <text>` calls.
const hcDir = mkdtempSync(join(tmpdir(), "pisend-hc-"));
const hcLog = join(hcDir, "sends.jsonl");
writeFileSync(join(hcDir, "hc"), `#!/usr/bin/env node\nrequire("fs").appendFileSync(${JSON.stringify(hcLog)}, JSON.stringify(process.argv.slice(2)) + "\\n");\n`);
chmodSync(join(hcDir, "hc"), 0o755);
process.env.FEATURE_HC_BIN = join(hcDir, "hc");
const sends = () => {
  try {
    return readFileSync(hcLog, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
};
const mod = await import("../extensions/pi-send.ts");
const factory = mod.default as (api: unknown) => void;

let dir: string;
let tokenFile: string;
const token = () => ({
  type: "feature-review",
  featureId: "fle-1",
  chunk: 2,
  round: 3,
  base: "a".repeat(40),
  tip: "b".repeat(40),
  nonce: "n0nce",
  worktree: dir,
  inbox: join(dir, ".feature", "inbox"),
  sessionFile: join(dir, ".feature", "reviews", "c2-r3.session"),
  reviewer: "fle-1-review-2",
  notesTo: "fle-1-review-2",
  chunkTitle: "Server data",
});

beforeEach(() => {
  rmSync(hcLog, { force: true });
  dir = mkdtempSync(join(tmpdir(), "pisend-"));
  tokenFile = join(dir, "token.json");
  writeFileSync(tokenFile, JSON.stringify(token()));
});
afterEach(() => {
  delete process.env.FEATURE_REVIEW;
  rmSync(dir, { recursive: true, force: true });
});

function fakeHunk() {
  const commands = new Map<string, { cmd: any; handler: (ctx: any) => Promise<void> }>();
  const events = new Map<string, (e: any) => void>();
  return {
    commands,
    events,
    api: {
      registerCommand: (cmd: any, handler: any) => commands.set(cmd.id, { cmd, handler }),
      on: (name: string, fn: any) => events.set(name, fn),
    },
  };
}

const snapshot = {
  generation: "g",
  stateRevision: 1,
  files: [{ fileKey: "k1", path: "src/a.ts" }],
  notes: [
    { id: "agent:1", source: "agent", author: "fle-1-review-2", fileKey: "k1", anchor: { newRange: [3, 3], intersectingHunkIndices: [0] }, summary: "[F1] (major) null check missing", resolution: "active", editable: false },
    { id: "agent:2", source: "agent", author: "fle-1-review-2", fileKey: "k1", anchor: { newRange: [9, 9], intersectingHunkIndices: [0] }, summary: "[F2] naming", resolution: "active", editable: false },
    { id: "user:1", parentId: "agent:2", source: "user", fileKey: "k1", anchor: { newRange: [9, 9], intersectingHunkIndices: [0] }, summary: "not useful: name matches the API", resolution: "active", editable: true },
    { id: "user:2", source: "user", fileKey: "k1", anchor: { newRange: [5, 5], intersectingHunkIndices: [0] }, summary: "nit: spacing", resolution: "active", editable: true },
  ],
};

function ctx(answers: { confirm?: boolean; input?: string | null; snap?: any } = {}) {
  const notes: [string, string | undefined][] = [];
  return {
    notes,
    cwd: dir,
    review: { snapshot: () => answers.snap ?? snapshot },
    dialogs: {
      confirm: async () => answers.confirm ?? true,
      input: async () => (answers.input === undefined ? "" : answers.input),
      select: async () => null,
    },
    notify: (m: string, t?: string) => notes.push([m, t]),
  };
}

const inbox = () => {
  try {
    return readdirSync(join(dir, ".feature", "inbox")).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(dir, ".feature", "inbox", f), "utf8")));
  } catch {
    return [];
  }
};

describe("ordinary reviews (no FEATURE_REVIEW)", () => {
  test("only the send command, with the original title and wording", () => {
    const h = fakeHunk();
    factory(h.api);
    expect([...h.commands.keys()]).toEqual(["send"]);
    expect(h.commands.get("send")!.cmd.title).toBe("Send notes to pi");
    const text = mod.message([{ id: "user:1", path: "a.ts", body: "x" }], "/repo", { id: "s1" });
    expect(text).toContain("Address each note");
  });
  test("loadFeatureToken is null without the env var, or for a bad file", () => {
    expect(mod.loadFeatureToken(undefined)).toBeNull();
    writeFileSync(join(dir, "bad.json"), "{}");
    expect(mod.loadFeatureToken(join(dir, "bad.json"))).toBeNull();
  });
});

describe("feature reviews", () => {
  test("registers only approve (A) and send (p, to the reviewer): no X", () => {
    process.env.FEATURE_REVIEW = tokenFile;
    const h = fakeHunk();
    factory(h.api);
    expect([...h.commands.keys()].sort()).toEqual(["approve", "send"]);
    expect(h.commands.get("approve")!.cmd.key).toBe("A");
    expect(h.commands.get("send")!.cmd.title).toBe("Send notes to fle-1-review-2");
  });

  test("approve writes one bound decision with notes, findings and replies; a second approve does nothing", async () => {
    process.env.FEATURE_REVIEW = tokenFile;
    const h = fakeHunk();
    factory(h.api);
    await h.commands.get("approve")!.handler(ctx());
    const [d] = inbox();
    expect(d.decision).toBe("approve");
    expect([d.featureId, d.chunk, d.round, d.base, d.tip, d.nonce]).toEqual(["fle-1", 2, 3, "a".repeat(40), "b".repeat(40), "n0nce"]);
    expect(d.notes.map((n: any) => n.id).sort()).toEqual(["user:1", "user:2"]);
    expect(d.notes.find((n: any) => n.id === "user:1").parentId).toBe("agent:2");
    expect(d.agentNotes.map((n: any) => n.id)).toEqual(["agent:1", "agent:2"]);
    const c = ctx();
    await h.commands.get("approve")!.handler(c);
    expect(inbox().length).toBe(1);
    expect(c.notes[0][1]).toBe("warning");
    expect(sends().length).toBe(0);
  });

  test("approve cancelled in the confirm dialog writes nothing", async () => {
    process.env.FEATURE_REVIEW = tokenFile;
    const h = fakeHunk();
    factory(h.api);
    await h.commands.get("approve")!.handler(ctx({ confirm: false }));
    expect(inbox().length).toBe(0);
  });

  test("p sends notes to the reviewer with ids, replies quoted with their author, and saves a copy; never a decision", async () => {
    process.env.FEATURE_REVIEW = tokenFile;
    const h = fakeHunk();
    factory(h.api);
    // Fresh note ids: "sent" bookkeeping is per Hunk process (module state).
    const snap = { ...snapshot, notes: [snapshot.notes[1], { ...snapshot.notes[2], id: "user:p1" }, { ...snapshot.notes[3], id: "user:p2" }] };
    await h.commands.get("send")!.handler(ctx({ snap }));
    const [call] = sends();
    expect(call.slice(0, 2)).toEqual(["send", "fle-1-review-2"]);
    const text = call[2];
    expect(text.startsWith('<hunk-notes chunk="2" round="3"')).toBe(true);
    expect(text.trimEnd().endsWith("</hunk-notes>")).toBe(true);
    expect(text).toContain("chunk 2 \"Server data\"");
    expect(text).toContain("[user:p1] src/a.ts new:9");
    expect(text).toContain('reply to [agent:2] (fle-1-review-2): "[F2] naming"');
    expect(text).toContain("feature reply <note id>");
    expect(text).not.toContain("Address each note");
    expect(inbox().length).toBe(0);
    const saved = readdirSync(join(dir, ".feature", "reviews")).filter((f) => f.startsWith("c2-r3-notes-"));
    expect(saved.length).toBe(1);
    // Nothing new after sending: p is a no-op.
    await h.commands.get("send")!.handler(ctx({ snap }));
    expect(sends().length).toBe(1);
  });

  test("quit with unsent notes sends them to the reviewer (no decision)", () => {
    process.env.FEATURE_REVIEW = tokenFile;
    const h = fakeHunk();
    factory(h.api);
    h.events.get("note_created")!({ note: { id: "user:9", filePath: "src/a.ts", newRange: [1, 1], body: "late note", draft: false } });
    h.events.get("shutdown")!({});
    const all = sends();
    expect(all.length).toBe(1);
    expect(all[0][1]).toBe("fle-1-review-2");
    expect(all[0][2]).toContain("late note");
    expect(inbox().length).toBe(0);
  });

  test("unrepliedFindings counts only tagged findings without a reply", () => {
    const agents = mod.agentNotesFromSnapshot(snapshot as any);
    const users = mod.fromSnapshot(snapshot as any);
    expect(mod.unrepliedFindings(agents, users).map((a: any) => a.id)).toEqual(["agent:1"]);
  });
});
