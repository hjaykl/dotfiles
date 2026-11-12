// bun test test/agent-send.test.ts (from ~/.dotfiles/.config/hunk) — ordinary review behaviour.
import { describe, expect, test } from "bun:test";

const mod = await import("../extensions/agent-send.ts");
const factory = mod.default as (api: unknown) => void;

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

describe("ordinary reviews", () => {
  test("only the send command, with the original title and wording", () => {
    const h = fakeHunk();
    factory(h.api);
    expect([...h.commands.keys()]).toEqual(["send"]);
    expect(h.commands.get("send")!.cmd.title).toBe("Send notes to agent");
    const text = mod.message([{ id: "user:1", path: "a.ts", body: "x" }], "/repo", { id: "s1" });
    expect(text).toContain("Address each note");
  });
});

describe("choosing the agent", () => {
  const zsh = { address: "t1", agent: "zsh", status: null };
  const claude = { address: "t2", agent: "claude-code", status: "idle" };
  const pi = { address: "t3", agent: "pi", status: "done" };

  test("the labelled listener wins", () => {
    expect(mod.pickTarget([pi], [zsh, claude, pi])).toMatchObject({ address: "t3" });
  });
  test("no label: the only agent in the space", () => {
    expect(mod.pickTarget([], [zsh, claude])).toMatchObject({ address: "t2" });
  });
  test("no label and several agents, or none: an error", () => {
    expect(mod.pickTarget([], [claude, pi])).toHaveProperty("error");
    expect(mod.pickTarget([], [zsh])).toHaveProperty("error");
  });
});
