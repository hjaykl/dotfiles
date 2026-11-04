// Opens the "lazygit" nvim popup: mod.open nvim-lazygit. Mods can't share code across
// folders, so this opens nvim-popup (invisible) with props { kind }.
import { View, div } from "gpui-kit";
import { props, openOverlay, closeOverlay } from "herdr";

export default class NvimLaunch extends View {
  init() {
    const self = props()?.overlay;
    if (self) closeOverlay(self);
    openOverlay({ mod: "nvim-popup", kind: "popup", width: 2, height: 2, frame: "none", props: { kind: "lazygit" } });
  }
  render() { return div(); }
}
