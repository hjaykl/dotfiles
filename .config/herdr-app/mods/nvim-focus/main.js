// Go to this space's nvim-server, starting one (a tab named "nvim") if it
// isn't running: mod.open nvim-focus. Runs ~/.bin/nvim-focus for the
// focused space, in the focused pane's folder.
import { View, div } from "gpui-kit";
import { props, focused, exec, home, notify, closeOverlay } from "herdr";

export default class NvimFocus extends View {
  init(_p, cx) {
    const self = props()?.overlay;
    cx.spawn(async () => {
      const f = focused();
      try {
        if (!f?.space || f.space.includes("/")) throw new Error("nvim-server is local-machine only for now");
        const r = await exec("/usr/bin/env", [
          `NVIM_SESSION=herdr-${f.space}`, `NVS_CWD=${f.cwd || home()}`, `${home()}/.bin/nvim-focus`,
        ]);
        if (r.code !== 0) throw new Error(r.stderr.trim() || "nvim-focus failed");
      } catch (e) {
        notify({ title: "nvim", body: String(e?.message ?? e), level: "error" });
      }
      if (self) closeOverlay(self);
    });
  }
  render() { return div(); }
}
