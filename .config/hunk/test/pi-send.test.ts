// bun test test/pi-send.test.ts (from ~/.dotfiles/.config/hunk) — ordinary review behaviour.
import { describe, expect, test } from "bun:test";

const mod = await import("../extensions/pi-send.ts");
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
    expect(h.commands.get("send")!.cmd.title).toBe("Send notes to pi");
    const text = mod.message([{ id: "user:1", path: "a.ts", body: "x" }], "/repo", { id: "s1" });
    expect(text).toContain("Address each note");
  });
});
