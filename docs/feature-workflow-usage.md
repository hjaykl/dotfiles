# Feature workflow v1: how to use it

Built from the approved v1 contract (`feature-workflow-build-brief.md`), which
supersedes the original proposal (`feature-workflow.md`) where they differ: no
tester, no archive, no Linear comment, user-controlled review loop, draft PR at
the end.

## Start

In a pi running inside the feature's worktree, in its Herdr space:

```
/feature FLE-2172                    # or a Linear URL, or plain-language task text
/feature --quick FLE-2172            # skip the preset discussion; picker still shown
```

The conversation becomes the **overseer**. It reads the ticket, proposes a
preset and opens the picker (`workflow_config`): preset, overseer and per-role
provider/model/thinking (available models only; scoped models if configured),
reviewer standards, save as defaults. **Start** writes `.feature/state.json` and
switches this conversation to the overseer model; Cancel writes nothing.

| preset | roles |
|---|---|
| tiny | implementer + your Hunk review |
| medium | planner + implementer + reviewer + Hunk |
| full | researcher + planner + implementer + reviewer + Hunk |

## While it runs (v2: the overseer is your single point of contact)

- You only talk to the overseer. It never blocks: agents work in the
  background and their messages arrive in its conversation.
- Agents are listed under the overseer in Herdr's agents list
  (`fle-2172-research`, `fle-2172-impl-1`, `fle-2172-review-1`…); peek to watch
  one, or "keep as tab". They are **read-only** for you: typing there is
  refused (`/unlock` if you really need to).
- Agent questions go to the overseer. It answers only from the plan/docs it can
  read or by delegating a research task; everything else comes to you word for
  word, and your answer goes back word for word (and into
  `.feature/decisions.md`).
- Each chunk opens in the `hunk` tab as one whole revision (base..tip), with the
  reviewer's findings as attributed notes:
  - comment and press `p` (or quit): your notes go to the chunk's **reviewer**,
    which answers questions in Hunk and turns requested changes into a fix list
    for the implementer (you see the list via the overseer)
  - `A` approves (or `/feature approve` in the overseer); approval overrides
    findings and is bound to the exact revision: anything stale is ignored
- `/feature status` (or ask "where are we?"), `/feature config`,
  `/feature resume` (a fresh overseer takes over from `.plan.md` + `.feature/`).

## Finish

When every chunk is approved the overseer writes `.feature/pr.md`, pushes and
opens a **draft** PR, then stops. `.plan.md` and `.feature/` stay in place
(globally git-ignored).

## Pieces

- `.agents/skills/feature/`: `SKILL.md` (overseer), `roles/`, `templates/`,
  `defaults.json`, `lib/` + `bin/feature.mjs` (`~/.bin/feature` CLI), `test/`.
- `.pi/agent/extensions/feature-workflow.ts`: `/feature`, picker, approval
  watcher (overseer only), read-only lock in role agents.
- `.config/hunk/extensions/pi-send.ts`: in feature reviews `p` goes to the
  reviewer and `A` approves (ordinary reviews unchanged);
  `.bin/hunk-open --feature-review <token>`.
- `install.sh`: links the extension and adds `.plan.md` / `.feature/` to the
  global git excludes file.

Tests: `node --test .agents/skills/feature/test/lib.test.mjs`,
`node .agents/skills/feature/test/e2e.mjs`,
`(cd .config/hunk && bun test test/pi-send.test.ts)`, plus the
`test/*.check.mjs` install/load checks.
