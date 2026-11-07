#!/usr/bin/env node
// feature: the overseer's deterministic helper for .feature/state.json.
// Run it from the feature's worktree (or pass --cwd). `feature help` lists commands.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { normalizeConfig } from "../lib/config.js";
import * as g from "../lib/git.js";
import { defaultTask, getTerminal, hc, killOwned, overseerInfo, pickName, sendNotes, spawnArgv, SKILL_DIR } from "../lib/hc.js";
import { featureIdFor } from "../lib/names.js";
import { findingsToComments, latestRound } from "../lib/review.js";
import {
  addChunk, getChunk, inboxFiles, ingestInbox, initFeature, loadState, paths, recordCommit, recordReview,
  reviewToken, setPhase, startChunk, startRound, tokenPath, updateState,
} from "../lib/state.js";
import { describeOutcome, refreshPlanStatus, statusLines } from "../lib/status.js";
import { FeatureError, nowIso, readJson, shortSha, writeJsonAtomic } from "../lib/util.js";

const HELP = `feature <command> [options]     (run in the feature worktree, or --cwd <dir>)

  status [--json]                     where are we: state + hc + git
  resume                              reconcile state with live agents and git; report disagreements
  inbox                               record approvals waiting in .feature/inbox (automatic in the overseer)
  phase <configured|research|planning|implementing|finishing|done> [--note text]
  blocker add <text> | blocker clear

  chunk add --title <t> [--acceptance <text>]
  chunk start <n> [--allow-dirty]     check HEAD = expected base and a clean tree; record base
  chunk commit <n>                    record HEAD as the chunk's current revision (base..HEAD)
  chunk review <n> --report <md> --findings <json>
                                      reviewer findings for the current revision
  review open <n>                     open the whole chunk (base..tip) in Hunk with reviewer notes;
                                      the person's notes (p) go to the chunk's reviewer, A approves
  review annotate <n>                 (re)apply reviewer notes to the open Hunk session
  reply <note id> --text <answer>     answer a person's Hunk note in place (agents use this)

  spawn <researcher|planner|implementer|reviewer> [--chunk n] [--brief path] [--task text]
  agent <name> --lost | --done        mark an agent in state (after checking hc)
  cleanup [--agent name | --chunk n | --all]   kill+remove agents this feature owns
  pr --title <t> --body <file> [--base <branch>]
                                      push the branch and open a DRAFT PR (all chunks approved);
                                      --base targets a stacked PR's parent branch (default: repo default)
  init --config <json> --title <t> [--ticket id] [--url u] [--task text]
                                      (normally done by /feature's picker)`;

function parse(argv) {
  const args = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) opts[key] = true;
      else {
        opts[key] = next;
        i++;
      }
    } else args.push(a);
  }
  return { args, opts };
}

const out = (s) => process.stdout.write(s.endsWith("\n") ? s : s + "\n");

function hunkBin() {
  for (const dir of (process.env.PATH ?? "").split(":")) if (dir && existsSync(join(dir, "hunk"))) return join(dir, "hunk");
  const fallback = join(homedir(), ".hunk", "bin", "hunk");
  return existsSync(fallback) ? fallback : "hunk";
}
const HUNK = process.env.FEATURE_HUNK_BIN || hunkBin();
const HUNK_OPEN = process.env.FEATURE_HUNK_OPEN || join(homedir(), ".bin", "hunk-open");

function overseerAddress(state) {
  return state.overseer?.terminal || process.env.HC_TERMINAL_ID || null;
}

function liveFacts(wt, state) {
  const agents = {};
  for (const [name, a] of Object.entries(state.agents)) if (a.status === "live") agents[name] = getTerminal(a.address ?? name);
  return {
    head: g.tryGit(wt, ["rev-parse", "HEAD"]),
    branch: g.branch(wt),
    dirty: (() => {
      try {
        return g.dirtyPaths(wt);
      } catch {
        return [];
      }
    })(),
    agents,
    inbox: inboxFiles(wt).length,
  };
}

function after(wt) {
  try {
    refreshPlanStatus(loadState(wt));
  } catch {}
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const commands = {
  help() {
    out(HELP);
  },

  status(wt, { opts }) {
    const state = loadState(wt);
    const facts = liveFacts(wt, state);
    if (opts.json) return out(JSON.stringify({ state, facts }, null, 2));
    out(statusLines(state, facts).join("\n"));
  },

  inbox(wt) {
    const outcomes = ingestInbox(wt).map(deliverLegacy);
    after(wt);
    if (!outcomes.length) return out("inbox: nothing waiting");
    for (const o of outcomes) out(describeOutcome(o));
  },

  resume(wt) {
    const state = loadState(wt);
    const facts = liveFacts(wt, state);
    const issues = [];
    for (const [name, t] of Object.entries(facts.agents)) {
      if (!t || t.state === "finished") issues.push(`agent ${name} (${state.agents[name].role}${state.agents[name].chunk != null ? ` chunk ${state.agents[name].chunk}` : ""}) is gone: mark it with \`feature agent ${name} --lost\` and replace it from its brief/reports if its work is unfinished`);
    }
    const current = state.chunks.find((c) => c.status !== "approved" && c.status !== "todo");
    if (current && facts.head) {
      if (current.status === "in_progress" && facts.head !== current.base)
        issues.push(`chunk ${current.n}: HEAD ${shortSha(facts.head)} moved past base ${shortSha(current.base)} but no commit is recorded: check the implementer's report, then \`feature chunk commit ${current.n}\``);
      else if (current.tip && facts.head !== current.tip && current.status !== "in_progress")
        issues.push(`chunk ${current.n}: HEAD is ${shortSha(facts.head)}, state says ${shortSha(current.tip)}: ask the person before continuing`);
    }
    const lastApproved = [...state.chunks].reverse().find((c) => c.status === "approved");
    if (!current && lastApproved && facts.head && facts.head !== lastApproved.tip)
      issues.push(`HEAD ${shortSha(facts.head)} is not the last approved tip ${shortSha(lastApproved.tip)}: ask the person how these commits relate`);
    if (facts.dirty.length) issues.push(`worktree has ${facts.dirty.length} uncommitted file(s): ask how they relate before implementing`);
    if (facts.inbox) issues.push(`${facts.inbox} Hunk decision(s)/notes waiting: run \`feature inbox\``);
    out(statusLines(state, facts).join("\n"));
    out(issues.length ? `\nReconcile:\n${issues.map((i) => `- ${i}`).join("\n")}` : "\nReconcile: state, agents and git agree.");
  },

  phase(wt, { args, opts }) {
    updateState(wt, (s) => setPhase(s, args[0], typeof opts.note === "string" ? opts.note : undefined));
    after(wt);
    out(`phase: ${args[0]}`);
  },

  blocker(wt, { args }) {
    const [sub, ...text] = args;
    updateState(wt, (s) => {
      if (sub === "add") s.blockers.push({ text: text.join(" "), at: nowIso() });
      else if (sub === "clear") s.blockers = [];
      else throw new FeatureError("blocker add <text> | blocker clear");
    });
    after(wt);
    out(sub === "add" ? "blocker recorded" : "blockers cleared");
  },

  chunk(wt, { args, opts }) {
    const [sub, nArg] = args;
    const n = Number(nArg);
    if (sub === "add") {
      if (typeof opts.title !== "string") throw new FeatureError("chunk add --title <title>");
      const c = updateState(wt, (s) => addChunk(s, opts.title, typeof opts.acceptance === "string" ? opts.acceptance : null));
      after(wt);
      return out(`chunk ${c.n} added: ${c.title}`);
    }
    if (sub === "start") {
      const c = updateState(wt, (s) => startChunk(s, n, { head: g.head(wt), dirty: g.dirtyPaths(wt), allowDirty: !!opts["allow-dirty"] }));
      after(wt);
      return out(`chunk ${n} started at base ${shortSha(c.base)}`);
    }
    if (sub === "commit") {
      const head = g.head(wt);
      const r = updateState(wt, (s) => {
        const c = getChunk(s, n);
        const commits = g.isAncestor(wt, c.base, head) ? g.commitsBetween(wt, c.base, head) : [];
        return recordCommit(s, n, { head, commits });
      });
      after(wt);
      const c = r.chunk;
      const list = c.revisions[c.revisions.length - 1].commits.map((x) => `  ${shortSha(x.sha)} ${x.subject}`).join("\n");
      return out(`${r.unchanged ? "unchanged" : "recorded"}: chunk ${n} = ${shortSha(c.base)}..${shortSha(c.tip)} (${c.revisions.length} revision(s))\n${list}`);
    }
    if (sub === "review") {
      if (typeof opts.report !== "string" || typeof opts.findings !== "string") throw new FeatureError("chunk review <n> --report <md> --findings <json>");
      const findings = readFindings(resolve(wt, opts.findings));
      const c = updateState(wt, (s) => recordReview(s, n, { report: resolve(wt, opts.report), findings }));
      after(wt);
      return out(`reviewer findings for chunk ${n} @ ${shortSha(c.tip)}: ${findings.length}`);
    }
    throw new FeatureError("chunk add|start|commit|review");
  },

  review(wt, { args }) {
    const [sub, nArg] = args;
    const n = Number(nArg);
    if (sub === "open") return openReview(wt, n);
    if (sub === "annotate") return annotate(wt, n);
    throw new FeatureError("review open|annotate <n>");
  },

  spawn(wt, { args, opts }) {
    const role = args[0];
    const chunk = opts.chunk !== undefined ? Number(opts.chunk) : null;
    const state = loadState(wt);
    const overseer = overseerAddress(state);
    if (!overseer) throw new FeatureError("no overseer terminal address (run inside hc)");
    const name = pickName(state, role, chunk);
    const brief = typeof opts.brief === "string" ? opts.brief : defaultBrief(role, chunk);
    const task = typeof opts.task === "string" ? opts.task : defaultTask({ state, role, chunk, name, overseer, brief });
    const space = state.overseer?.space ?? null;
    const argv = spawnArgv({ state, role, chunk, name, task, space, skillDir: SKILL_DIR });
    const res = JSON.parse(hc(argv, { timeout: 120_000 }));
    updateState(wt, (s) => {
      s.agents[name] = { role, chunk, address: res.address, status: "live", spawnedAt: nowIso(), model: { ...s.config.roles[role] } };
      if (chunk != null && (role === "implementer" || role === "reviewer")) getChunk(s, chunk)[role] = name;
    });
    after(wt);
    const sent = res.first_message ? ` · first message sent: ${res.first_message.sent}` : "";
    out(`spawned ${name} (${res.address}) · ${role} · ${state.config.roles[role].provider}/${state.config.roles[role].model} · ${state.config.roles[role].thinking}${sent}`);
    if (res.first_message && res.first_message.sent === false) out(`WARNING: task not delivered (${res.first_message.reason}); hc read ${name} before resending`);
  },

  agent(wt, { args, opts }) {
    const name = args[0];
    updateState(wt, (s) => {
      if (!s.agents[name]) throw new FeatureError(`no agent ${name} in state`);
      s.agents[name].status = opts.lost ? "lost" : opts.done ? "done" : s.agents[name].status;
      s.agents[name].changedAt = nowIso();
    });
    out(`${name}: ${opts.lost ? "lost" : "done"}`);
  },

  cleanup(wt, { opts }) {
    const state = loadState(wt);
    const targets = Object.entries(state.agents).filter(([name, a]) =>
      a.status !== "killed" && (opts.all || opts.agent === name || (opts.chunk !== undefined && a.chunk === Number(opts.chunk))),
    );
    if (!targets.length) return out("cleanup: nothing matched");
    const results = targets.map(([name]) => killOwned(state, name));
    updateState(wt, (s) => {
      for (const r of results) if (r.result === "killed" || r.result === "gone") s.agents[r.name].status = "killed";
    });
    for (const r of results) out(`${r.name}: ${r.result}`);
  },

  pr(wt, { opts }) {
    const state = loadState(wt);
    if (typeof opts.title !== "string" || typeof opts.body !== "string") throw new FeatureError("pr --title <t> --body <file>");
    if (!state.chunks.length || state.chunks.some((c) => c.status !== "approved")) throw new FeatureError("every chunk must be approved by the person first");
    const head = g.head(wt);
    const last = state.chunks[state.chunks.length - 1];
    if (head !== last.tip) throw new FeatureError(`HEAD ${shortSha(head)} is not the last approved revision ${shortSha(last.tip)}`);
    if (g.dirtyPaths(wt).length) throw new FeatureError("worktree has uncommitted changes");
    const branch = g.branch(wt);
    if (!branch) throw new FeatureError("detached HEAD: no branch to push");
    const base = typeof opts.base === "string" ? opts.base : null;
    if (opts.base === true) throw new FeatureError("--base needs a branch name");
    if (base) {
      // A stacked PR's parent must exist on the remote, or gh would fail after the push.
      const found = g.tryGit(wt, ["ls-remote", "--heads", "origin", base]);
      if (!found) throw new FeatureError(`base branch ${base} does not exist on origin`);
      if (base === branch) throw new FeatureError("--base is the feature branch itself");
    }
    // Check an existing PR before pushing, so a wrong base is reported, not hidden.
    let existing = null;
    try {
      existing = JSON.parse(execFileSync("gh", ["pr", "view", branch, "--json", "url,isDraft,baseRefName"], { cwd: wt, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
    } catch {}
    if (existing && base && existing.baseRefName !== base)
      throw new FeatureError(`a PR already exists for ${branch} (${existing.url}) targeting ${existing.baseRefName}, not ${base}: not changing it; ask the person`);
    execFileSync("git", ["-C", wt, "push", "-u", "origin", `HEAD:refs/heads/${branch}`], { stdio: "inherit" });
    let url;
    if (existing) {
      url = existing.url;
      out(`a PR already exists for ${branch}: ${url} (base ${existing.baseRefName}; pushed the branch; body not changed)`);
    } else {
      const args = ["pr", "create", "--draft", "--head", branch, ...(base ? ["--base", base] : []), "--title", opts.title, "--body-file", resolve(wt, opts.body)];
      url = execFileSync("gh", args, { cwd: wt, encoding: "utf8" }).trim().split("\n").pop();
      out(`draft PR opened: ${url}${base ? ` (base ${base})` : ""}`);
    }
    updateState(wt, (s) => {
      s.pr = { url, at: nowIso(), head, draft: true, base: base ?? existing?.baseRefName ?? null };
      setPhase(s, "done", "draft PR opened");
    });
    after(wt);
  },

  init(wt, { opts }) {
    if (typeof opts.config !== "string" || typeof opts.title !== "string") throw new FeatureError("init --config <json> --title <t>");
    const config = normalizeConfig(readJson(resolve(opts.config)));
    const ticket = typeof opts.ticket === "string" ? opts.ticket : null;
    const task = typeof opts.task === "string" ? opts.task : null;
    const state = initFeature(wt, {
      feature: { id: featureIdFor({ ticket, task: task ?? opts.title }), ticket, url: typeof opts.url === "string" ? opts.url : null, title: opts.title, task },
      config,
      overseer: overseerInfo(),
    });
    out(`feature ${state.feature.id} initialised at ${shortSha(state.feature.startCommit)}`);
  },

  reply(wt, { args, opts }) {
    const id = args[0];
    const text = typeof opts.text === "string" ? opts.text : args.slice(1).join(" ");
    if (!id || !text.trim()) throw new FeatureError('reply <note id> --text "<answer>"');
    const state = loadState(wt);
    const found = findNote(wt, id) ?? findLiveNote(state, id);
    if (!found) throw new FeatureError(`no Hunk note ${id} in this feature's recorded reviews or its live Hunk sessions`);
    const author = typeof opts.author === "string" ? opts.author : agentNameFor(state, process.env.HC_TERMINAL_ID) ?? "overseer";
    const session = found.hunkSession;
    if (!session) throw new FeatureError("that review recorded no Hunk session");
    const r = spawnSync(HUNK, ["session", "comment", "add", session, "--reply-to", id, "--summary", text, "--author", author, "--focus", "--json"], { encoding: "utf8" });
    if (r.status !== 0) {
      throw new FeatureError(`Hunk session ${session} did not take the reply (${(r.stderr || r.stdout).trim().split("\n").pop()}). If that review is closed, put the answer in your report instead.`);
    }
    out(`replied to ${id} in Hunk session ${session} as ${author}`);
  },

  token(wt, { args }) {
    const state = loadState(wt);
    const c = getChunk(state, Number(args[0]));
    const r = latestRound(c);
    if (!r) throw new FeatureError(`chunk ${c.n} has no round`);
    out(tokenPath(wt, c.n, r.round));
  },
};

/** The recorded decision (raw inbox file) that carried this note, newest first. */
function findNote(wt, id) {
  const dir = paths(wt).processed;
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort().reverse();
  for (const f of files) {
    try {
      const d = JSON.parse(readFileSync(join(dir, f), "utf8"));
      const note = (d.notes ?? []).find((n) => n.id === id) ?? (d.agentNotes ?? []).find((n) => n.id === id);
      if (note) return { decision: d, note, hunkSession: d.hunkSession };
    } catch {}
  }
  return null;
}

/** Live notes of a running Hunk session, or null when it is gone. */
function liveComments(session) {
  const r = spawnSync(HUNK, ["session", "comment", "list", session, "--type", "all", "--json"], { encoding: "utf8" });
  if (r.status !== 0) return null;
  try {
    return JSON.parse(r.stdout).comments ?? [];
  } catch {
    return null;
  }
}

/** A note in one of this feature's live Hunk sessions (newest round first). */
function findLiveNote(state, id) {
  const rounds = state.chunks.flatMap((c) => c.rounds).filter((r) => r.hunkSession).reverse();
  for (const r of rounds) {
    const note = (liveComments(r.hunkSession) ?? []).find((c) => c.noteId === id);
    if (note) return { note, hunkSession: r.hunkSession };
  }
  return null;
}

function agentNameFor(state, terminal) {
  if (!terminal) return null;
  const hit = Object.entries(state.agents).find(([, a]) => a.address === terminal);
  return hit ? hit[0] : null;
}

function deliverLegacy(o) {
  if (!o.legacyNotes) return o;
  const r = sendNotes(o);
  return { ...o, delivered: r.ok, deliveryError: r.error };
}

function defaultBrief(role, chunk) {
  if (role === "researcher") return ".feature/briefs/research.md";
  if (role === "planner") return ".feature/briefs/plan.md";
  return `.feature/briefs/${chunk}-${role === "implementer" ? "impl" : "review"}.md`;
}

function readFindings(file) {
  const raw = readJson(file);
  const list = Array.isArray(raw) ? raw : raw.findings;
  if (!Array.isArray(list)) throw new FeatureError(`${file}: expected {"findings": [...]}`);
  return list.map((f, i) => {
    if (!f.summary) throw new FeatureError(`${file}: finding ${i + 1} has no summary`);
    return {
      id: f.id && /^F\d+$/.test(f.id) ? f.id : `F${i + 1}`,
      severity: f.severity ?? null,
      file: f.file ?? null,
      line: f.line != null ? Number(f.line) : null,
      side: f.side === "old" ? "old" : "new",
      summary: String(f.summary),
      rationale: f.rationale ? String(f.rationale) : undefined,
    };
  });
}

function openReview(wt, n) {
  const opened = updateState(wt, (s) => {
    const round = startRound(s, n);
    const chunk = getChunk(s, n);
    const token = reviewToken(s, chunk, round);
    writeJsonAtomic(tokenPath(wt, n, round.round), token);
    return { round, token };
  });
  after(wt);
  const { round, token } = opened;
  const tokenFile = tokenPath(wt, n, round.round);
  const range = `${round.base}...${round.tip}`;
  const r = spawnSync(HUNK_OPEN, ["--feature-review", tokenFile, "diff", range], { cwd: wt, stdio: "inherit" });
  if (r.status !== 0) throw new FeatureError(`hunk-open failed (exit ${r.status}); the round is open: retry with \`hunk-open --feature-review ${tokenFile} diff ${range}\``);
  out(`chunk ${n} round ${round.round}: ${shortSha(round.base)}..${shortSha(round.tip)} opened in Hunk (tab "hunk")`);
  const session = waitForSession(token.sessionFile, 30_000);
  if (!session) {
    out(`WARNING: Hunk did not report its session within 30s; reviewer notes not applied. When Hunk is up: feature review annotate ${n}`);
    return;
  }
  updateState(wt, (s) => {
    const rr = getChunk(s, n).rounds.find((x) => x.round === round.round);
    rr.hunkSession = session;
  });
  annotate(wt, n);
}

function waitForSession(file, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (existsSync(file)) {
      const id = readFileSync(file, "utf8").trim();
      if (id) return id;
    }
    sleep(250);
  }
  return null;
}

function annotate(wt, n) {
  const state = loadState(wt);
  const chunk = getChunk(state, n);
  const round = latestRound(chunk);
  if (!round || round.status !== "open") throw new FeatureError(`chunk ${n} has no open round`);
  const session = round.hunkSession ?? (existsSync(reviewToken(state, chunk, round).sessionFile) ? readFileSync(reviewToken(state, chunk, round).sessionFile, "utf8").trim() : null);
  if (!session) throw new FeatureError("no Hunk session recorded for this round yet");
  if (!round.findings.length) return out(`no reviewer findings to show (round ${round.round})`);
  const review = JSON.parse(execFileSync(HUNK, ["session", "review", session, "--json"], { encoding: "utf8" }));
  const author = chunk.reviewer ?? `${state.feature.id}-reviewer`;
  const comments = findingsToComments(round.findings, review.review ?? review, author);
  const res = spawnSync(HUNK, ["session", "comment", "apply", session, "--stdin", "--focus", "--json"], { input: JSON.stringify({ comments }), encoding: "utf8" });
  if (res.status !== 0) throw new FeatureError(`hunk comment apply failed: ${res.stderr || res.stdout}`);
  out(`applied ${comments.length} reviewer note(s) to Hunk session ${session} as ${author}`);
}

async function main() {
  const { args, opts } = parse(process.argv.slice(2));
  const cmd = args.shift() ?? "help";
  const fn = commands[cmd];
  if (!fn) {
    out(HELP);
    process.exit(2);
  }
  const wt = cmd === "help" ? null : g.toplevel(resolve(typeof opts.cwd === "string" ? opts.cwd : process.cwd()));
  try {
    await fn(wt, { args, opts });
  } catch (e) {
    process.stderr.write(`feature ${cmd}: ${e.message}\n`);
    process.exit(e instanceof FeatureError ? 1 : 3);
  }
}

main();
