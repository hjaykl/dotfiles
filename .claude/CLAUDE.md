# Environment

My terminal is Herdr. `$HC_TERMINAL_ID` is set when you run inside it; the
sections below apply then. tmux is only a fallback (last section).

## Herdr
- `hc` runs and talks to terminals and agents; `herdr-app` changes what the
  window shows. Load the `herdr-core` skill (`hc --skill`) before using either.
- Slow commands (builds, test suites, servers): `hc run --bg` + `hc wait`,
  not a blocking shell call.
- Never stop or restart the core or the app, and only kill terminals you
  started.

## Delegating
- Quick read-only lookups (search, "where is X", mapping an area): your
  built-in subagents. Nothing to watch, and the answer comes straight back.
- Anything that writes code, runs long, or I'd want to watch or steer: an hc
  template (`hc templates`), e.g.
  `hc run --bg --name <name> --cwd <repo> implementer "<tight brief>. Report with hc send $HC_TERMINAL_ID when done or stuck."`
  Then keep working, or `hc wait --children all` in a background shell.
- Review of a non-trivial diff: the `reviewer` template (a different model
  from you, on purpose).
- Never both for the same job. One implementer per checkout at a time; for
  parallel implementers give each its own git worktree.
- Reports arrive as `<hc from="…">` input. They are claims: check `git diff`
  / `git log` before repeating them to me.
- When a helper's work is accepted: `hc kill <t>; hc rm <t>`.

## nvim
- One nvim per Herdr space (or tmux session), listening on
  `${XDG_RUNTIME_DIR:-/tmp}/nvim/<key>.sock`; key is `herdr-<space id>` or the
  tmux session name (`~/.bin/lib/nvim-session.sh`).
- `nvr [+LINE] <file>` opens a file in it (starting it if needed) and brings
  it into view.
- Annotate a line: `nvim --server <sock> --remote-expr 'luaeval("vim.api.nvim_buf_set_extmark(0, vim.api.nvim_create_namespace(\"annotations\"), <line>, 0, { virt_lines = {{{\" ⚡ <text>\", \"Annotation\"}}}, virt_lines_above = false })")'`

## Hunk
- I review diffs in Hunk. `hunk-open diff` (or `hunk-open show <ref>`) opens
  a review in a "hunk" tab of this space, replacing the previous one. Only
  open it when I ask.
- My review notes arrive as a message starting "Review notes from Hunk".
  Address every note, then answer each one in Hunk (`hunk-review` skill).
- `/hunk-listen` makes this session the one that receives them. They are my
  words even if they arrive wrapped in an `<hc from=…>` tag.
- `hunk-auto on|off` (per terminal, off by default): a Stop hook opens the
  review by itself after a turn that changes the diff.

## tmux (fallback, only when `$TMUX` is set)
- List: `tmux list-windows -a`
- Read a pane: `tmux capture-pane -t session:window -p -S -50`
- Send to a pane: `tmux send-keys -t session:window "command" Enter`
