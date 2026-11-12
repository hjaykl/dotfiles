// A small menu of the nvim popups (mod.open nvim-popup). Each one also has
// its own launcher mod for keys: nvim-files, nvim-buffers, nvim-grep,
// nvim-yazi, nvim-lazygit (mod.open <name>); those open this mod with props
// { kind }, and it opens that popup without the menu.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, theme, closeOverlay } from "herdr";
import { POPUPS, launch } from "./lib.js";

const ORDER = [
  ["files", "Find files", "nvim-files"],
  ["buffers", "Buffers", "nvim-buffers"],
  ["grep", "Grep", "nvim-grep"],
  ["yazi", "Yazi", "nvim-yazi"],
  ["lazygit", "Lazygit", "nvim-lazygit"],
];

export default class NvimPopup extends View {
  init(_p, cx) {
    this.h = cx.focus_handle();
    this.sel = 0;
    // Opened by a launcher mod (nvim-files, ...) with { kind }: open that popup, no menu.
    const kind = props()?.kind;
    if (POPUPS[kind]) {
      this.direct = true;
      launch(kind, cx, props()?.overlay);
      return;
    }
    this.h.focus();
  }

  pick(i, cx) {
    const self = props()?.overlay;
    launch(ORDER[i][0], cx, self);
  }

  render() {
    if (this.direct) return div();
    const t = theme();
    return v_flex()
      .id("root").size_full().p(6).gap(2).text_size(13)
      .track_focus(this.h)
      .on_key_down((e, cx) => {
        const k = e.keystroke?.key ?? e.key;
        if (k === "down" || k === "j") { this.sel = (this.sel + 1) % ORDER.length; cx.notify(); }
        else if (k === "up" || k === "k") { this.sel = (this.sel + ORDER.length - 1) % ORDER.length; cx.notify(); }
        else if (k === "enter") this.pick(this.sel, cx);
        else if (k === "escape") closeOverlay(props()?.overlay);
        else {
          const i = ORDER.findIndex(([kind]) => kind[0] === k);
          if (i >= 0) this.pick(i, cx);
        }
      })
      .children(ORDER.map(([kind, label, mod], i) =>
        h_flex().id(`row-${kind}`).px(10).py(6).rounded(5).gap(8).items_center().cursor_pointer()
          .when(i === this.sel, (el) => el.bg(t.selected))
          .hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => this.pick(i, cx))
          .child(div().w(14).text_color(t.accent).font_semibold().child(kind[0]))
          .child(div().flex_1().text_color(t.foreground).child(label))
          .child(div().text_color(t.dim).text_size(11).child(mod))));
  }
}
