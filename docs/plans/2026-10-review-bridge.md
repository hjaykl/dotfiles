# lgtm — two-way code review comments between nvim and herdr agents

**Status:** planned, not started · **Owner:** jacob · **Build vs buy:** build (gap analysis below)
**v1 scope:** comments only — create them, render them in code, resolve them. Nothing else.

## Why build it

Nobody researched covers all three directions we want:

| Tool | human→agent | agent→human as code comments | outcome tracking |
|---|---|---|---|
| doubt.nvim | ✅ XML export | ✅ agent-authored claim JSON | ✅ per-claim outcome + claim-scoped diff |
| herdr-nvim | ✅ annotations → any agent pane | ❌ send-only, in-memory | ❌ |
| herdr-gitview | ✅ notes → agent pane | ❌ | ❌ |
| oversight / meow.review / review.nvim | ✅ markdown export | ❌ export-only | ❌ |
| CodeCompanion (beta reviews) | ✅ accept/revert/comment | ❌ | 🟡 own rounds |
| claudecode.nvim | ✅ selection tracking | 🟡 inbound diffs, not notes | ❌ |

doubt.nvim is closest but its vocabulary is adversarial (`question`/`concern`/`reject`) and its
machinery assumes a complaint loop; we want the same mechanism for **explanation**. And no
third-party plugin can resolve agents/nvim sockets **by herdr workspace**, which is the whole
point of our stack. We already own every primitive: `herdr-scope`, `nvim-scope-sock`,
`picker_rpc.lua`, `lazygit-to-qf`'s Lua dispatch, `herdr agent prompt`.

Borrow doubt's *implementation ideas* (re-anchoring on edit, stale detection, agent-written
session files, the instructions-to-copy block) with **no schema compatibility tax**.

## Use cases in priority order

1. **I review an agent's code** — mark ranges, write what's wrong, resolve when fixed.
2. **An agent annotates code to explain it** — "this reads the lockfile twice, that's why
   startup is slow" — rendered inline, clearly authored by the agent.
3. **One agent reviews another's diff** (or mine) and I read the findings in place.

## Goals / non-goals (v1)

**Goals:** one comment object; both humans and agents are first-class authors; comments render
in the code, collapsible; a quickfix view of everything unresolved in order; comments survive
nvim restarts, edits, renames, and agent restarts.

**Non-goals for v1:** sending comments to an agent (`lgtm send`), handoff formats, review-run
outcome tracking, git porcelain (lazygit/herdr-gitview own that), threads/replies, PR server
integration, accept-reject of *code*, side-split panel.

## Core model

One object, one file format, three writers (you, agent A, agent B):

```jsonc
// .lgtm/<session>.json   (repo-local, gitignored by default)
{
  "schema_version": 1,
  "session": "explain-auth-flow",
  "repo": "/Users/jacob/lab",
  "comments": [
    {
      "id": "c-01J...",
      "author": { "kind": "agent", "name": "pi" },   // the field doubt lacks: agents are not special cases
      "created_ms": 1761321000000,
      "file": "scripts/dns.sh",                      // repo-relative
      "start": { "line": 42, "col": 1 },
      "end":   { "line": 47, "col": 1 },
      "kind": "explain",                             // explain | note | concern | reject | praise | question
      "text": "Reads the lockfile twice — once here, once in resolve().",
      "anchor": "sha256:<hash of anchored lines>",   // stale detection
      "status": "open"                               // open | resolved | stale | orphan
    }
  ]
}
```

- **`author` drives styling**, `kind` drives meaning: an agent's `explain` and my `concern` are
  visually distinct even when kinds collide.
- **Kinds are data** (table in `lua/lgtm/kinds.lua`: glyph, colours, default status), so adding
  `praise` or `todo` is one entry, no code paths.

## Architecture

```
┌──────────────── nvim (nvim --listen $(nvim-scope-sock)) ────────────────┐
│ ~/Dev/nvim-lgtm                                                          │
│   render  : one namespace; extmarks + virt_lines + signs; collapsible    │
│   qf      : everything unresolved, ordered                               │
│   edit    : :Lgtm add / resolve / delete / reload / toggle                │
│   watch   : vim.uv.fs_event on .lgtm/ → merge & repaint                    │
└───────────────┬──────────────────────────────▲───────────────────────────┘
                │ read/write (atomic)          │ fs_event repaint
        ┌───────▼───────────────────────────────┴──────┐
        │  .lgtm/<session>.json   (repo-local store)   │
        └───────▲───────────────────────────▲──────────┘
                │ lgtm add --file … --kind …│ nvim :Lgtm add
        ┌───────┴────────┐        ┌─────────┴────────┐
        │ agent (pi,…)   │        │ you, in nvim     │
        └────────────────┘        └──────────────────┘
```

1. **Store** — JSON per session, atomic write (temp + rename), merge-by-`id` on load so a
   concurrent writer can never clobber comments it has not seen. `schema_version` gated.
2. **nvim plugin** (`~/Dev/nvim-lgtm`, native packages install) — pure Lua, zero deps.
3. **CLI (`lgtm`)** — what agents and scripts call: `add`, `list --json`, `resolve`,
   `instructions`. Same merge/atomic rules as the plugin; no nvim required.

## Rendering (the v1 UX bar)

- Comment text renders **in the code** at the range end via `virt_lines` — no side panel, no
  floating window stealing focus.
- Gutter sign per comment, coloured by author kind; inline label `pi▸ explain`.
- **Collapsible:** `z` on a comment's sign toggles between one-line summary and full text;
  `za`-style global toggle for all comments in the buffer (`:Lgtm!` / `<leader>lt`). Long
  comments default collapsed to their first line.
- Range highlight (subtle, per kind) so it is obvious what each comment refers to.
- **`:LgtmQF`** populates the quickfix list with **unresolved** comments, ordered by file path
  then start position: `{file}:{line}  {author} {kind}  {first line of text}`. Resolved/stale
  excluded by default; `:LgtmQF all|stale|mine|agent` to widen.

## Agent-side contract (v1 minimal)

`lgtm instructions` prints the paste-into-`AGENTS.md` block: how to add a comment, kind
vocabulary, "never edit source while reviewing unless asked", id round-trip, store path.

```sh
lgtm add --file scripts/dns.sh --start 42:1 --end 47:1 \
         --kind explain --author agent:pi --text "Reads the lockfile twice…"
```

Multi-line text via `--text -` (stdin). Inbound is deliberately **file-drop only** in v1 — no
nvim socket needed by agents, works with any CLI agent, and repaint happens through the
watcher. RPC inbound (`v:lua.require('lgtm').api.add`) waits until file-drop proves out.

## herdr-specific leverage (the reason to build it)

- Session/scope naming through `herdr-scope`, so comments and the nvim socket share one key
  (`herdr`, `lab`, `worktree-rapid-stone-c6b6`…).
- v2 targeting via `herdr agent list` (`pane_id`, `agent`, `agent_status`, `workspace_id`,
  `cwd`) + `herdr agent prompt` with atomic `--wait --until idle`; herdr refuses to type into a
  **blocked** agent (`agent_blocked`) — a real advantage over `tmux send-keys`.
- v2: thin herdr plugin manifest exposing `lgtm.qf` / `lgtm.send` as actions.

## Edge cases decided up front

| Case | Decision |
|---|---|
| Two tabs, same repo, one workspace | Comments are **repo+session scoped**, not tab-scoped — one truth per session |
| Linked worktree checkout | Scope slug differs (as `herdr-scope` already does) → comments never cross checkouts |
| Code under a comment changed | `anchor` hash mismatch → `status: stale`, dimmed, excluded from `:LgtmQF` until re-anchored |
| File deleted/renamed | Kept as `orphan`; jump offers restore-or-drop |
| Agent writes invalid JSON | Reject the load with an error naming byte offset; never rewrite/truncate the file |
| Two writers, same file | Merge by `id`, per-`id` last-write-wins, conflicts logged to `:Lgtm state` |
| Secrets in comments | `.lgtm/` gitignored by default; `lgtm doctor` warns if it is not |
| Huge ranges | Cap embedded code slices (40 lines) with explicit opt-in |

## Home & install

- **Dev checkout:** `~/Dev/nvim-lgtm` (plugin), CLI at `~/Dev/nvim-lgtm/bin/lgtm` → `~/.bin/lgtm`.
- **Install via native packs** (matches the existing `pack/core/` layout):
  ```sh
  ln -s ~/Dev/nvim-lgtm ~/.local/share/nvim/site/pack/core/start/lgtm   # eager
  # or …/pack/core/opt/lgtm + :packadd lgtm                             # lazy
  ```

## Milestones (v1 = commenting only)

- **M0 — spikes.** `vim.uv.fs_event` latency on `.lgtm/`; extmark re-anchor + `virt_lines` with
  wrapped lines and folds; per-kind highlight namespaces; atomic merge in shell + Lua.
  *Exit: written answers, no code committed.*
- **M1 — store.** `schema_version` load/save/merge/validate + `lgtm add|list|resolve`.
  *Check: CLI adds a comment → `lgtm list --json` shows it; two writers merge without loss.*
- **M2 — render.** signs, range highlight, inline author+kind, in-code `virt_lines`, collapse
  toggle. *Check: hand-written JSON renders on restart; scrolling/folding/`ggGoG` leaves no
  ghost virt_lines.*
- **M3 — authoring + qf.** `:Lgtm add` (line/visual range), resolve, delete, reload, and
  `:LgtmQF` ordered unresolved list. *Check: 5 comments across 3 files → qf order matches
  file+position; resolving one removes it from qf on next `:LgtmQF`.*
- **M4 — agent loop.** `lgtm instructions` + watcher repaint. *Check: pi adds three `explain`
  comments to a real file in this workspace; they render with agent authorship, collapse, and
  re-anchor after I edit above them.*

**Deferred to v2:** `lgtm send` (handoff formatting → `herdr agent prompt`), review-run outcome
tracking, orphan/rename recovery UI, herdr plugin actions, export.

## Remaining open questions

1. Session default name when nobody passes one — `default`, or date-stamped (`2026-10-24`)?
2. Do we need per-tab sessions at all, or always one session per repo+workspace (v1 plan says
   the latter)?
3. `<leader>` key prefix for lgtm (`<leader>c` is taken by what? pick a free one).
4. Collapse state persisted per buffer/session, or always fresh on load (v1 plan: fresh)?
