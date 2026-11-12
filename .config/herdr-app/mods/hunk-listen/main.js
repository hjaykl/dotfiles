// Make the focused agent the one that gets Hunk review notes in this space
// (toggle): mod.open hunk-listen. Runs ~/.bin/hunk-listen as that terminal,
// so no agent turn is spent on it. The result shows as a toast, and the
// listener's tab name carries " ◉ hunk".
import { View, div } from "gpui-kit";
import { props, focused, exec, hc, home, notify, closeOverlay } from "herdr";

export default class HunkListen extends View {
  init(_p, cx) {
    const self = props()?.overlay;
    cx.spawn(async () => {
      try {
        const f = focused();
        if (!f?.terminal) throw new Error("no terminal focused");
        if (f.space?.includes("/")) throw new Error("local-machine only for now");
        const t = JSON.parse((await hc(["get", "--json", f.terminal])).stdout);
        if (!t.status) throw new Error("the focused pane isn't running an agent");
        const r = await exec("/usr/bin/env", [`HC_TERMINAL_ID=${f.terminal}`, `${home()}/.bin/hunk-listen`]);
        if (r.code !== 0) throw new Error(r.stderr.trim() || "hunk-listen failed");
        notify({ title: "Hunk", body: r.stdout.trim().split("\n")[0] });
      } catch (e) {
        notify({ title: "Hunk", body: String(e?.message ?? e), level: "error" });
      }
      if (self) closeOverlay(self);
    });
  }
  render() { return div(); }
}
