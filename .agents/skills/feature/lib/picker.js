// The config picker as plain data: menu lines in, actions out. The pi
// extension drives it with ctx.ui.select; tests drive it directly.
import { PRESETS, PRESET_NAMES, REQUIRED_ROLES, ROLES, applyPreset, modelKey, pickableModels, setRoleEnabled } from "./config.js";

const cap = (s) => s[0].toUpperCase() + s.slice(1);

export const PRESET_HELP = {
  tiny: "implementer + your Hunk review (overseer briefs the implementer directly)",
  medium: "planner + implementer + reviewer + your Hunk review",
  full: "researcher + planner + implementer + reviewer + your Hunk review",
};

/** Main menu: [{ id, label }]. ids: start, preset, overseer, role:<r>, standards, save, cancel. */
export function mainMenu(config, { save }) {
  const items = [{ id: "start", label: "▶ Start with this configuration" }];
  items.push({ id: "preset", label: `Preset       ${config.preset}${PRESETS[config.preset] ? `  (${PRESET_HELP[config.preset]})` : "  (custom role set)"}` });
  items.push({ id: "overseer", label: `Overseer     ${modelKey(config.overseer)} · ${config.overseer?.thinking ?? "?"}  (this conversation)` });
  for (const role of ROLES) {
    const r = config.roles[role];
    items.push({
      id: `role:${role}`,
      label: r.enabled ? `✓ ${cap(role).padEnd(11)} ${modelKey(r)} · ${r.thinking}` : `· ${cap(role).padEnd(11)} off`,
    });
  }
  if (config.roles.reviewer.enabled) items.push({ id: "standards", label: `Reviewer standards: ${(config.roles.reviewer.standards ?? []).join(", ") || "none"}` });
  items.push({ id: "hunk", label: "Hunk review  always on (you approve every chunk)" });
  items.push({ id: "save", label: `Save as defaults: ${save ? "yes" : "no"}` });
  items.push({ id: "cancel", label: "✕ Cancel" });
  return items;
}

export function roleMenu(config, role) {
  const r = config.roles[role];
  const items = [];
  if (!REQUIRED_ROLES.includes(role)) items.push({ id: "toggle", label: r.enabled ? "Disable this role" : "Enable this role" });
  items.push({ id: "model", label: `Model     ${modelKey(r)}` });
  items.push({ id: "thinking", label: `Thinking  ${r.thinking}` });
  items.push({ id: "back", label: "← Back" });
  return items;
}

export function presetMenu(current) {
  return PRESET_NAMES.map((p) => ({ id: p, label: `${p === current ? "● " : "  "}${p.padEnd(7)} ${PRESET_HELP[p]}` }));
}

/** Model list for one slot: current first ("keep"), then by provider. */
export function modelMenu(available, scoped, current) {
  const usable = pickableModels(available, scoped);
  const sorted = [...usable].sort((a, b) => a.provider.localeCompare(b.provider) || a.id.localeCompare(b.id));
  const items = [];
  const cur = current && sorted.find((m) => m.provider === current.provider && m.id === current.model);
  if (cur) items.push({ id: `${cur.provider}/${cur.id}`, label: `keep: ${cur.provider}/${cur.id}`, model: cur });
  for (const m of sorted) if (m !== cur) items.push({ id: `${m.provider}/${m.id}`, label: `${m.provider}/${m.id}`, model: m });
  return items;
}

export function thinkingMenu(levels, current) {
  return levels.map((l) => ({ id: l, label: `${l === current ? "● " : "  "}${l}` }));
}

/** Keep the wanted level if supported, else the closest supported one. */
export function clampThinking(levels, want) {
  if (!levels?.length) return "off";
  if (levels.includes(want)) return want;
  const order = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
  const w = order.indexOf(want);
  let best = levels[0];
  let dist = Infinity;
  for (const l of levels) {
    const d = Math.abs(order.indexOf(l) - w);
    if (d < dist) {
      best = l;
      dist = d;
    }
  }
  return best;
}

/** Apply one change. slot: "overseer" or a role. */
export function setModel(config, slot, model) {
  const prev = slot === "overseer" ? config.overseer : config.roles[slot];
  const next = { ...prev, provider: model.provider, model: model.id, thinking: clampThinking(model.thinkingLevels, prev?.thinking ?? "medium") };
  return slot === "overseer" ? { ...config, overseer: next } : { ...config, roles: { ...config.roles, [slot]: next } };
}

export function setThinking(config, slot, level) {
  return slot === "overseer"
    ? { ...config, overseer: { ...config.overseer, thinking: level } }
    : { ...config, roles: { ...config.roles, [slot]: { ...config.roles[slot], thinking: level } } };
}

export function toggleRole(config, role) {
  return setRoleEnabled(config, role, !config.roles[role].enabled);
}

export function setStandards(config, text) {
  const standards = String(text ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return { ...config, roles: { ...config.roles, reviewer: { ...config.roles.reviewer, standards } } };
}

export { applyPreset };
