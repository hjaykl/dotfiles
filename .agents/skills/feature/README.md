# feature: overseer + role agents (v1)

`/feature <ticket | Linear URL | task>` in a pi inside the feature's worktree
(Herdr space). Details: `SKILL.md` (overseer), `roles/` (appended to each agent's
system prompt), `templates/`, `defaults.json` (picker defaults; "Save as
defaults" rewrites it), `lib/` + `bin/feature.mjs` (deterministic state/review
rules, used by the CLI and the pi extension
`~/.pi/agent/extensions/feature-workflow.ts`). Hunk side:
`~/.config/hunk/extensions/pi-send.ts` (A approves; p sends notes to the reviewer).

Tests: `node --test test/lib.test.mjs`, `node test/e2e.mjs`,
`cd ~/.dotfiles/.config/hunk && bun test test/pi-send.test.ts`.
