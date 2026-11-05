# Feature workflow: overseer + role agents

A pi skill that runs a feature from a Linear ticket to a PR. You talk to one
long-lived **overseer**; it plans the workflow with you, then coordinates role
agents (researcher, planner, implementer, reviewer, tester) through Herdr, and
can tell you the state of the feature at any time.

Built from what this setup already has: Herdr + `hc` for agents, pi for every
role, hunk (+ `/hunk-listen`) for your review, the Linear MCP for tickets.

## Goals

- One conversation per feature (the overseer), which never reads or writes code,
  so its context stays small for the whole build.
- A short **meta-planning** step at kickoff: you choose the flow, roles, gates and
  each role's model **from pick lists**, not by typing names.
- All state in **one file per feature** (`.plan.md`): config, plan, progress,
  decisions. Any agent, or a fresh overseer, can resume from it.
- Ask the overseer "where are we?" any time and get a consistent, cheap answer.
- Scale down for small work: the full six roles only when the work needs it.

## Non-goals (for now)

- Parallel implementers (needs a worktree per implementer and merging).
- A workspace board UI (later; it would read the same `.plan.md` files).
- ADRs, a glossary, or tickets in Linear for each chunk.
- Creating the worktree/space from the ticket (kickoff starts in an existing one).

## How it's used

```
/skill:feature FLE-1782          # in a pi, in the feature's worktree space
  → overseer reads the ticket, proposes a preset and config
  → you discuss; it opens the config picker (workflow_config); you adjust
  → it writes .plan.md (front matter = config) and asks to start
  → research → plan (you grill with the planner) → chunks:
       implementer → reviewer → you in hunk → done
  → tests → PR description → Linear comment
"where are we?"                  # any time: status from .plan.md + hc + git
/feature --quick FLE-1782        # skip the chat: pickers with defaults, then start
```

## Components

```
~/.dotfiles/
  .agents/skills/feature/
    SKILL.md               overseer instructions (kickoff, spawning, gates, status, finish)
    defaults.yaml          presets, per-role default models, gates
    roles/
      researcher.md        role instructions, appended to each sub-agent's system prompt
      planner.md
      implementer.md
      reviewer.md
      tester.md
    templates/
      plan.md              .plan.md skeleton
      brief.md             chunk brief skeleton
      report.md            agent report skeleton
  .pi/agent/extensions/
    feature-workflow.ts    workflow_config tool + /feature command
```

`install.sh` links `feature-workflow.ts` into `~/.pi/agent/extensions/` next to
`hunk-listen.ts`. The skill reaches pi through `~/.agents/skills` (stow).

### 1. `.plan.md`: the feature's single source of truth

At the worktree root, ignored in every repo through the global git ignore
(`core.excludesFile`: add `.plan.md` and `.feature/`). The YAML front matter is
the workflow config; the body is the plan.

```markdown
---
ticket: FLE-1782
title: Add default date to reporting filters
branch: timgill/fle-1782-add-default-date-to-reporting-filters
preset: medium
overseer: { provider: github-copilot, model: gpt-6.1-sol, thinking: medium }
roles:
  researcher:  { enabled: true,  provider: litellm, model: "GLOBAL claude-sonnet-5-5", thinking: low, sources: [linear, github] }
  planner:     { enabled: true,  provider: github-copilot, model: gpt-6.1-sol, thinking: high }
  implementer: { enabled: true,  provider: litellm, model: "GLOBAL claude-sonnet-5-5", thinking: medium }
  reviewer:    { enabled: true,  provider: github-copilot, model: gpt-6.1-sol, thinking: high, standards: [AGENTS.md] }
  tester:      { enabled: false }
gates: [reviewer, hunk]        # per chunk, in this order
parallel: false
on_done: [pr, linear-comment]
---
# Add default date to reporting filters

## Goal
2–3 lines: what and why.

## Approach
Key decisions. **Out of scope:** …

## Steps
- [x] 1. API: default date range when none given · done · abc1234
- [ ] 2. Page: show the default in the filter · review (reviewer passed, waiting for hunk) · implementer-2
- [ ] 3. e2e tests · todo

Each step has acceptance criteria (a line or two) under it.

## Notes
- 11-04: dates in UTC: the API stores UTC (from implementer-1)
```

Step states: `todo` → `in progress` → `review` → `done` (or `blocked: reason`).
Owner = the agent's hc name (`implementer-2`) while it's assigned.

**One writer:** only the overseer edits `.plan.md` after the planner's first draft
is approved. Everyone else writes their own files and reports back.

### 2. Working files: `.feature/`

Also globally ignored. Keeps handovers as files, so messages stay one line.

```
.feature/
  research.md            researcher's write-up (facts, links, relevant code locations)
  plan-draft.md          planner's draft, before the overseer takes it into .plan.md
  briefs/2.md            what implementer-2 must do: step, acceptance criteria,
                         relevant research excerpts, files likely involved
  reports/2-impl.md      what changed, commit, decisions, anything unfinished
  reports/2-review.md    reviewer verdict: pass / changes needed, findings with file:line
  reports/2-hunk.md      your hunk notes for the chunk (from /hunk-listen)
  test-plan.md           tester's plan; results appended
```

### 3. `defaults.yaml`

```yaml
presets:
  tiny:   { roles: [implementer],                       gates: [hunk] }
  medium: { roles: [planner, implementer, reviewer],    gates: [reviewer, hunk] }
  full:   { roles: [researcher, planner, implementer, reviewer, tester],
            gates: [reviewer, hunk] }
models:                      # default per role; the picker starts on these
  overseer:    { provider: github-copilot, model: gpt-6.1-sol, thinking: medium }
  researcher:  { provider: litellm, model: "GLOBAL claude-sonnet-5-5", thinking: low }
  planner:     { provider: github-copilot, model: gpt-6.1-sol, thinking: high }
  implementer: { provider: litellm, model: "GLOBAL claude-sonnet-5-5", thinking: medium }
  reviewer:    { provider: github-copilot, model: gpt-6.1-sol, thinking: high }
  tester:      { provider: litellm, model: "GLOBAL claude-haiku-5-5", thinking: low }
standards: [AGENTS.md]
on_done: [pr, linear-comment]
```

(Model choices here are placeholders, settled at the first kickoff.)

### 4. pi extension `feature-workflow.ts`

**Tool `workflow_config`** (called by the overseer during kickoff):
- Input: the proposed config (preset, roles, models, gates, parallel, on_done) and a
  one-line reason per choice.
- Opens a review screen (`ctx.ui.custom`, or chained `ctx.ui.select` to start):
  one line per role, e.g. `implementer  litellm / Sonnet 5.5 · medium   ✓`, plus
  preset, gates, parallel, Save/Start/Cancel.
- Selecting a role line: **enabled?** → **provider** → **model** → **thinking**.
  - Providers and models from `ctx.modelRegistry.getAvailable()`, grouped by
    provider. If `ctx.scopedModels` is non-empty, only those.
  - Each list starts with the current choice ("keep: …").
  - Thinking levels limited to what the model supports.
- Selecting the preset line re-applies that preset's roles and gates.
- Returns the final config to the agent (or `cancelled`). Offers "save as
  defaults" when you changed something, writing `defaults.yaml`.
- Tokens: none for the picking; the agent only sees the result.

**Command `/feature [--quick] <ticket>`**:
- Without `--quick`: sends `/skill:feature <ticket>` as a user message (the skill
  does the conversation and calls the tool).
- With `--quick`: runs the same picker directly with the preset guessed from
  defaults, then hands the result to the skill ("config chosen, start").

**Validation in the tool:** every chosen model must be available now; refuse to
return a config whose model can't be used (avoids spawning a failing agent).

### 5. Overseer (`SKILL.md`)

Frontmatter: `name: feature`, a description for `/skill:feature`, and
`disable-model-invocation: true` (only started on purpose).

Sections:

1. **Rules.** Never read or edit source code; work through files in `.feature/`
   and agents' reports. Keep messages to agents and from agents short; pass paths.
   Only you edit `.plan.md`.
2. **Kickoff.**
   - Fetch the ticket from Linear (title, description, comments, suggested branch
     name) and nothing else.
   - Judge size → preset. Ask only about what's unusual (sources for research,
     whether UI testing is needed).
   - Call `workflow_config` with the proposal. On the result, write `.plan.md`
     from `templates/plan.md` with the config as front matter.
   - Run `/hunk-listen` (ask the person to, if it can't itself).
   - Ask to start.
3. **Spawning an agent.**
   ```sh
   hc run --bg --name <role>-<n> --cwd "$PWD" \
     --label feature.role=<role> --label feature.step=<n> -- \
     pi --provider <p> --model <id> --thinking <level> \
        --append-system-prompt ~/.agents/skills/feature/roles/<role>.md \
        "<one line: read .feature/briefs/<n>.md, report with hc send $HC_TERMINAL_ID>"
   ```
   - Names are unique per feature (`implementer-2`, `reviewer-2`).
   - Agents the person should talk to (planner, sometimes researcher): show them
     with `herdr-app do terminal.keep --terminal <t> --place right` and tell the
     person.
   - Wait with `hc wait --children any`; process each report; wait again.
   - Kill finished agents (`hc kill`) once their report is recorded.
4. **Phases.**
   - *Research* (if enabled) → `.feature/research.md`. Overseer reads only its
     summary section.
   - *Planning:* planner grills the person directly (kept as a pane), writes
     `plan-draft.md` with steps sized for one fresh agent each, acceptance criteria
     per step, and a test outline. Person approves → overseer moves it into
     `.plan.md`.
   - *Chunks* (serial): for each `todo` step in order, write `briefs/<n>.md`,
     spawn `implementer-<n>`, then run the gates (below), then mark `done` with
     the commit.
   - *Testing* (if enabled): tester writes `test-plan.md` early (after planning)
     and runs it after the last chunk (Playwright MCP / browser; needs the dev
     server). Results and manual checks go to the person.
   - *Finish:* PR description (from `.plan.md` + reports), a short Linear comment
     (one MCP call), then archive: copy `.plan.md` and `.feature/` to
     `~/worklog/<repo>/<branch>/`.
5. **Gates per chunk** (from `gates:`):
   - `reviewer`: spawn `reviewer-<n>` with the brief, the commit, the standards
     files. Verdict `changes needed` → send findings to the implementer (still
     alive) or a new one; at most 2 rounds, then ask the person.
   - `hunk`: tell the person "chunk n ready: `hunk-open show <commit>`" (or open
     it for them). Hunk notes arrive through `/hunk-listen` → save to
     `reports/<n>-hunk.md` → send to the implementer → repeat the gate. The
     person says "approve n" → `done`.
6. **Status** ("where are we?"): read `.plan.md`, `hc ls --label feature.role`
   (+ `hc get` for status), `git log <base>..HEAD --oneline`, `git status -s`,
   and pending hunk notes. Answer in this shape:
   ```
   Feature: <title> (<ticket>) · preset <p>
   Done: 2/5 · In review: 3 (reviewer passed, waiting for your hunk review)
   Working: implementer-4 (step 4, 6 min)
   Blocked: none · Hunk notes not handled: 1 (step 3)
   Next: step 5 after 4 · New decisions: dates in UTC
   ```
7. **Failure handling.**
   - An agent `blocked` for the person: tell the person which, and how to reach it.
   - An agent stuck or looping (wait timeouts without progress, or a report that
     says so): read its last lines (`hc read --lines 40`), then kill and respawn
     with a sharper brief, or ask the person.
   - Overseer restarted: read `.plan.md`, list `feature.role` agents, continue.
8. **Scaling.** For `tiny`: no plan phase. One step from the ticket, implementer,
   hunk gate, finish.

### 6. Role instructions (`roles/*.md`)

Each 20–40 lines: purpose, what to read, what to write, how to report, limits.

| Role | Reads | Writes | Reports | Limits |
|---|---|---|---|---|
| researcher | ticket, Linear/GitHub/Sentry via MCP, the repo | `research.md` (summary first; facts + links + code locations) | "research done, N sources" | no plans or code changes |
| planner | ticket, `research.md`, the repo | `plan-draft.md` (goal, approach, out of scope, steps with acceptance criteria, test outline) | "draft ready" | grills the person first; steps sized for one fresh agent |
| implementer | its brief, relevant code | code, one commit per step, `reports/<n>-impl.md` | "step n committed <sha>" | only its step; no plan edits; stops and asks if the brief is wrong |
| reviewer | brief, commit diff, standards, `.plan.md` acceptance criteria | `reports/<n>-review.md` | "pass" / "changes needed: k findings" | no code changes; cites file:line and the rule |
| tester | `.plan.md`, `research.md`, the running app | `test-plan.md`, results | "k passed, m failed, manual: …" | no code changes except test files when asked |

Every role ends with: write your file, then `hc send <overseer> "<one line>"`,
then stop. The overseer's address comes in the first message.

### 7. Hunk integration (already built)

- `/hunk-listen` in the overseer: one listener per space, so your notes always
  reach it.
- `hunk-open show <commit>` opens the chunk in the `hunk` tab; `p` or quitting
  sends notes; message carries the hunk session id for replies.
- The overseer forwards notes to the implementer; replies in hunk come from the
  implementer with `--author implementer-<n>`.

## Build milestones

Each ends with a check on a real ticket.

1. **Plan format + overseer basics** *(skill only)*
   - `templates/plan.md`, `SKILL.md` sections 1, 3, 4 (chunks only), 5 (hunk
     gate only), 6.
   - `roles/implementer.md`.
   - Global git ignore for `.plan.md` and `.feature/`.
   - Done when: on a tiny ticket, the overseer writes `.plan.md`, spawns an
     implementer, waits, records the commit, sends the chunk to hunk, applies your
     notes, and answers "where are we?" correctly; restarting the overseer
     mid-way resumes from `.plan.md`.
2. **Config picker** *(extension)*
   - `defaults.yaml`, `workflow_config` tool, `/feature --quick`.
   - Done when: kickoff shows the review screen with your providers/models,
     changes are reflected in `.plan.md` front matter, spawned agents run on the
     chosen models (`hc get` shows the argv), "save as defaults" updates the file.
3. **Planner + reviewer** *(medium preset)*
   - `roles/planner.md`, `roles/reviewer.md`, reviewer gate with retry limit.
   - Done when: a medium ticket goes plan → 3+ chunks, each reviewed then
     hunk-approved, with findings and decisions recorded in Notes.
4. **Researcher + tester + finish** *(full preset)*
   - `roles/researcher.md`, `roles/tester.md`, PR description, Linear comment,
     archive to `~/worklog`.
   - Done when: a UI ticket runs end to end, the tester's plan exists before
     chunk 1 and its results arrive after the last chunk, the PR body and Linear
     comment are posted.
5. **Polish** (only if needed): failure handling details, `install.sh` links,
   dotfiles commit, a `status` shortcut (`/feature status`).

## Risks and open questions

- **Overseer drift:** it may start reading code "just to check". The rules say
  no; if it keeps happening, remove read tools from it (pi `--tools`) and let it
  use only bash for `hc`/`git log`/file reads in `.feature/`.
- **Context growth over a long build:** mitigated by one-line reports and
  `.plan.md` as memory; if needed, compact between chunks.
- **Agent prompts on start:** pi sub-agents started with `hc run` need to be
  ready before their first message; passing the task as pi's initial argument
  avoids that.
- **Tester environment:** dev server, seed data and logins per repo are not
  solved here; the tester asks the person the first time and records it in
  `research.md` (or a per-repo file later).
- **Model availability:** LiteLLM models only appear if they're in
  `~/.pi/agent/models.json`; the picker shows what's usable now.
- **Where kickoff starts:** in the feature's worktree space for now. Later the
  overseer could create the worktree + space from Linear's branch name.
- **Standards source:** reviewer uses `AGENTS.md` (+ any listed files). A
  dedicated `STANDARDS.md` per repo may be worth it once findings repeat.

## Decisions needed before milestone 1

1. Default models per role (and the overseer's).
2. Archive location (`~/worklog/<repo>/<branch>/` proposed) and whether that
   folder is its own git repo.
3. The first ticket to trial on (tiny or medium).
