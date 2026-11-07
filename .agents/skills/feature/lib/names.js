// Feature identity, ticket parsing and hc agent names.
import { randomId } from "./util.js";

export const ROLE_SHORT = {
  researcher: "research",
  planner: "plan",
  implementer: "impl",
  reviewer: "review",
};

const HC_NAME = /^[a-z0-9_-]{1,32}$/;
export const isValidHcName = (name) => HC_NAME.test(name);

const TICKET = /^([A-Za-z][A-Za-z0-9]*-\d+)$/;
const LINEAR_URL = /linear\.app\/[^/\s]+\/issue\/([A-Za-z][A-Za-z0-9]*-\d+)/i;

/**
 * Recognise a ticket in the kickoff input: a bare id (FLE-2172) or a Linear
 * URL. Anything else is a plain-language task brief.
 * @returns {{ ticket: string, url?: string, rest: string } | null}
 */
export function parseTicket(input) {
  const text = String(input ?? "").trim();
  if (!text) return null;
  const [first, ...more] = text.split(/\s+/);
  const rest = more.join(" ");
  const url = first.match(LINEAR_URL);
  if (url) return { ticket: url[1].toUpperCase(), url: first, rest };
  const bare = first.match(TICKET);
  if (bare) return { ticket: bare[1].toUpperCase(), rest };
  return null;
}

export function slugify(text, max = 40) {
  const slug = String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.slice(0, max).replace(/-+$/g, "");
}

/** Feature id used in agent names and labels: ticket id, else task slug + random suffix. */
export function featureIdFor({ ticket, task }, rand = randomId(2)) {
  if (ticket) return slugify(ticket, 20);
  const words = slugify(task || "feature", 14) || "feature";
  return `${words}-${rand}`.slice(0, 20);
}

/**
 * Unique hc name for a role agent, max 32 chars, e.g. fle-2172-impl-3.
 * `taken` holds names of live terminals (any owner); collisions get -2, -3…
 */
export function agentName(featureId, role, chunk, taken = new Set()) {
  const short = ROLE_SHORT[role];
  if (!short) throw new Error(`unknown role: ${role}`);
  const tail = `${short}${chunk != null ? `-${chunk}` : ""}`;
  for (let n = 1; n < 100; n++) {
    const suffix = n === 1 ? "" : `-${n}`;
    const room = 32 - tail.length - suffix.length - 1;
    const head = slugify(featureId, room) || "f";
    const name = `${head}-${tail}${suffix}`;
    if (!isValidHcName(name)) throw new Error(`could not build a valid hc name from ${featureId}/${role}`);
    if (!taken.has(name)) return name;
  }
  throw new Error("no free agent name");
}
