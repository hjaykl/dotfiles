// Workflow configuration: presets, defaults, validation against the models
// that are actually usable right now.
import { existsSync } from "node:fs";
import { readJson, writeJsonAtomic } from "./util.js";

export const ROLES = ["researcher", "planner", "implementer", "reviewer"];
export const PRESETS = {
  tiny: ["implementer"],
  medium: ["planner", "implementer", "reviewer"],
  full: ["researcher", "planner", "implementer", "reviewer"],
};
export const PRESET_NAMES = Object.keys(PRESETS);
export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
export const DEFAULT_STANDARDS = ["AGENTS.md"];

/** Roles every preset needs: the work cannot happen without an implementer. */
export const REQUIRED_ROLES = ["implementer"];

export function loadDefaults(path) {
  const raw = existsSync(path) ? readJson(path) : {};
  return {
    preset: PRESETS[raw.preset] ? raw.preset : "full",
    overseer: raw.overseer ?? null,
    roles: raw.roles ?? {},
    standards: Array.isArray(raw.standards) && raw.standards.length ? raw.standards : DEFAULT_STANDARDS,
  };
}

/** Save the chosen config as the picker's starting point (keeps unrelated keys). */
export function saveDefaults(path, config) {
  const prev = existsSync(path) ? readJson(path) : {};
  const roles = {};
  for (const role of ROLES) {
    const r = config.roles[role];
    if (r?.provider && r?.model) roles[role] = { provider: r.provider, model: r.model, thinking: r.thinking };
  }
  const next = {
    ...prev,
    preset: PRESETS[config.preset] ? config.preset : prev.preset ?? "full",
    overseer: config.overseer ? { ...config.overseer } : prev.overseer ?? null,
    roles,
    standards: config.roles.reviewer?.standards?.length ? [...config.roles.reviewer.standards] : prev.standards ?? DEFAULT_STANDARDS,
  };
  writeJsonAtomic(path, next);
  return next;
}

export const modelKey = (m) => (m ? `${m.provider}/${m.model}` : "?");

/**
 * Build the picker's starting config. Priority per role: the agent's proposal,
 * saved defaults, then the current session model (shown, never silently used:
 * the person still has to press Start).
 */
export function seedConfig({ defaults, current, proposal = {} }) {
  const preset = PRESETS[proposal.preset] ? proposal.preset : defaults.preset;
  const pick = (p, d) => {
    const src = p?.provider && p?.model ? p : d?.provider && d?.model ? d : current;
    return src ? { provider: src.provider, model: src.model, thinking: src.thinking ?? current?.thinking ?? "medium" } : null;
  };
  const roles = {};
  for (const role of ROLES) {
    const m = pick(proposal.roles?.[role], defaults.roles?.[role]);
    roles[role] = { enabled: PRESETS[preset].includes(role), ...m };
  }
  roles.reviewer.standards = [...(proposal.roles?.reviewer?.standards ?? proposal.standards ?? defaults.standards)];
  return { preset, overseer: pick(proposal.overseer, defaults.overseer), roles };
}

/** Re-apply a preset's role set, keeping each role's model choice. */
export function applyPreset(config, preset) {
  if (!PRESETS[preset]) throw new Error(`unknown preset: ${preset}`);
  const roles = {};
  for (const role of ROLES) roles[role] = { ...config.roles[role], enabled: PRESETS[preset].includes(role) };
  return { ...config, preset, roles };
}

export function enabledRoles(config) {
  return ROLES.filter((r) => config.roles[r]?.enabled);
}

/** The preset matching the enabled roles, or "custom". */
export function detectPreset(config) {
  const on = enabledRoles(config).join(",");
  return PRESET_NAMES.find((p) => PRESETS[p].join(",") === on) ?? "custom";
}

export function setRoleEnabled(config, role, enabled) {
  if (!enabled && REQUIRED_ROLES.includes(role)) throw new Error(`${role} is required`);
  const roles = { ...config.roles, [role]: { ...config.roles[role], enabled } };
  const next = { ...config, roles };
  return { ...next, preset: detectPreset(next) };
}

/**
 * Models the picker may offer. `scoped` (ctx.scopedModels) narrows the list
 * when the person configured scoping; it is empty/null otherwise.
 * @param {{provider:string,id:string,thinkingLevels:string[]}[]} available
 */
export function pickableModels(available, scoped) {
  if (!scoped || scoped.length === 0) return available;
  const keys = new Set(scoped.map((s) => `${s.provider}/${s.id}`));
  return available.filter((m) => keys.has(`${m.provider}/${m.id}`));
}

/**
 * Validate a config against the usable catalogue.
 * @param catalog {{ available: {provider,id,thinkingLevels}[], scoped?: {provider,id}[] | null }}
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateConfig(config, catalog) {
  const errors = [];
  const usable = pickableModels(catalog.available, catalog.scoped);
  const check = (label, m) => {
    if (!m?.provider || !m?.model) {
      errors.push(`${label}: no model chosen`);
      return;
    }
    const found = usable.find((x) => x.provider === m.provider && x.id === m.model);
    if (!found) {
      const anywhere = catalog.available.some((x) => x.provider === m.provider && x.id === m.model);
      errors.push(
        anywhere
          ? `${label}: ${modelKey(m)} is outside this session's scoped models`
          : `${label}: ${modelKey(m)} is not available (unknown model or no auth)`,
      );
      return;
    }
    if (!THINKING_LEVELS.includes(m.thinking)) errors.push(`${label}: unknown thinking level "${m.thinking}"`);
    else if (!found.thinkingLevels.includes(m.thinking))
      errors.push(`${label}: ${modelKey(m)} does not support thinking "${m.thinking}" (supports: ${found.thinkingLevels.join(", ")})`);
  };
  check("overseer", config.overseer);
  for (const role of REQUIRED_ROLES) if (!config.roles[role]?.enabled) errors.push(`${role} must be enabled`);
  for (const role of enabledRoles(config)) check(role, config.roles[role]);
  if (!PRESETS[config.preset] && config.preset !== "custom") errors.push(`unknown preset ${config.preset}`);
  return { ok: errors.length === 0, errors };
}

/** One line per setting, for the picker and status. */
export function describeConfig(config) {
  const lines = [`preset ${config.preset} · Hunk review always on`];
  lines.push(`overseer     ${modelKey(config.overseer)} · ${config.overseer?.thinking ?? "?"}`);
  for (const role of ROLES) {
    const r = config.roles[role];
    if (!r?.enabled) {
      lines.push(`${role.padEnd(12)} off`);
      continue;
    }
    const extra = role === "reviewer" && r.standards?.length ? ` · standards: ${r.standards.join(", ")}` : "";
    lines.push(`${role.padEnd(12)} ${modelKey(r)} · ${r.thinking}${extra}`);
  }
  return lines;
}

/** Strip the config to what state.json keeps (disabled roles keep no model). */
export function normalizeConfig(config) {
  const roles = {};
  for (const role of ROLES) {
    const r = config.roles[role];
    roles[role] = r?.enabled
      ? { enabled: true, provider: r.provider, model: r.model, thinking: r.thinking, ...(role === "reviewer" ? { standards: [...(r.standards ?? [])] } : {}) }
      : { enabled: false };
  }
  return { preset: config.preset, overseer: { ...config.overseer }, roles };
}
