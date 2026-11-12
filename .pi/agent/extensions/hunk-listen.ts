/**
 * hunk-listen: make this pi the one that receives your Hunk review notes.
 *
 *   /hunk-listen [on|off|status]   no argument toggles
 *
 * All the work is in ~/.bin/hunk-listen: it marks this terminal with an hc
 * label (hunk.listen=<space id>), and Hunk's agent-send extension
 * (~/.config/hunk/extensions/agent-send.ts) types the notes into the marked
 * terminal with `hc send`. Reviews that could not be delivered earlier are
 * printed by the script and passed on here as a message.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const MARK = "\nUndelivered review:\n";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("hunk-listen", {
    description: "Toggle receiving Hunk review notes in this pi (one listener per Herdr space)",
    handler: async (args, ctx) => {
      const argv = args.trim().split(/\s+/).filter(Boolean).slice(0, 1);
      const out = await new Promise<{ ok: boolean; text: string }>((resolve) => {
        execFile(join(homedir(), ".bin", "hunk-listen"), argv, { encoding: "utf8", timeout: 10_000 }, (err, stdout, stderr) =>
          resolve({ ok: !err, text: (err ? stderr || String(err) : stdout).trim() }),
        );
      });
      if (!out.ok) {
        ctx.ui.notify(out.text, "error");
        return;
      }
      const [head, ...reviews] = out.text.split(MARK);
      ctx.ui.notify(head.trim(), "info");
      ctx.ui.setStatus("hunk-listen", /^Listening/.test(head) ? "hunk ◉ listening" : undefined);
      for (const r of reviews) if (r.trim()) pi.sendUserMessage(r.trim());
    },
  });
}
