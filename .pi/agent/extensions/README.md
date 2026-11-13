# Pi Extensions

Extensions and skills for the pi coding agent. `install.sh` links the ones
this setup uses into `~/.pi/agent/extensions`.

| Extension | Description |
|-----------|-------------|
| `hunk-listen` | `/hunk-listen`: receive your Hunk review notes in this pi (runs `~/.bin/hunk-listen`) |
| `web-search-kagi` | `web_search` tool: Kagi search, run by `lib/kagi-search.mjs` (needs `KAGI_API_KEY`) |
| `caffeinate-keep-awake` | Keeps the Mac awake during agent sessions |
| `lmstudio` | LM Studio provider for local LLMs |
| `ssh` | SSH remote execution for file operations |

| Helper | Description |
|--------|-------------|
| `lib/kagi-search.mjs` | Standalone Kagi search CLI, used by `web-search-kagi` |
| `lib/render.ts` | Collapsed/expanded result rendering for tools |

| Skill | Description |
|-------|-------------|
| `notetaking/SKILL.md` | Create, list, search notes in `~/Notes` |
