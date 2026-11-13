# Environment

My terminal is Rex. `$REX_SESSION` and `$REX_BLOCK` say which session and
pane (block) you run in; I may be looking at a different tab.

## Rex
- Use the `rex` CLI for tabs, panes and other terminals (the `rex` skill has
  the guide).
- Slow commands I may want to watch (builds, test suites, servers): run them
  in a background tab, `rex run -s "$REX_SESSION" --focus=false --label <name> -- <cmd>`,
  then `rex wait <block>` (in a background shell) and `rex capture -b <block> --trim`.
- Don't move my view: pass `--focus=false`, and switch tabs only when I ask.
- Never stop Rex or restart its server, and only close tabs and blocks you
  opened.

## Delegating
- Lookups and self-contained tasks: your built-in subagents.
- One agent writing to a checkout at a time; parallel implementers each get
  their own git worktree.
- A subagent's report is a claim: check `git diff` / `git log` before
  repeating it to me.

## nvim
- One nvim per Rex session, listening on
  `${XDG_RUNTIME_DIR:-/tmp}/nvim/rex-<session id>.sock`
  (`~/.bin/lib/nvim-session.sh`).
- `nvr [+LINE] <file>` opens a file in it (starting it if needed) and brings
  it into view.
- Annotate a line: `nvim --server <sock> --remote-expr 'luaeval("vim.api.nvim_buf_set_extmark(0, vim.api.nvim_create_namespace(\"annotations\"), <line>, 0, { virt_lines = {{{\" ⚡ <text>\", \"Annotation\"}}}, virt_lines_above = false })")'`

## Hunk
- I review diffs in Hunk. `hunk-open diff` (or `hunk-open show <ref>`) opens
  a review in the "hunk" tab of this session, replacing the previous one.
  Only open it when I ask.
- My review notes arrive as a message starting "Review notes from Hunk".
  They are my words. Address every note, then answer each one in Hunk
  (`hunk-review` skill).
- `/hunk-listen` (or my `cmd+shift+h`) makes this session the one that
  receives them.
