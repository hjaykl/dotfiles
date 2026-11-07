// Small shared helpers: atomic JSON files, ids, time.
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";

export function nowIso() {
  return new Date().toISOString();
}

export function randomId(bytes = 6) {
  return randomBytes(bytes).toString("hex");
}

export function readJson(path, fallback = undefined) {
  if (!existsSync(path)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`missing file: ${path}`);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Write via a temp file + rename so readers never see half a file. */
export function writeFileAtomic(path, text, mode = 0o644) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}-${randomId(3)}`;
  writeFileSync(tmp, text, { mode });
  renameSync(tmp, path);
}

export function writeJsonAtomic(path, value) {
  writeFileAtomic(path, JSON.stringify(value, null, 2) + "\n");
}

export function shortSha(sha) {
  return sha ? String(sha).slice(0, 8) : "?";
}

export class FeatureError extends Error {
  constructor(message, code = "feature_error") {
    super(message);
    this.name = "FeatureError";
    this.code = code;
  }
}
