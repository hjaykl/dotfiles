# Environment

## tmux
- Run `tmux-status` to see active sessions, windows, and nvim sockets
- Read any pane silently: `tmux capture-pane -t session:window -p -S -50`
- Send commands to any pane: `tmux send-keys -t session:window "command" Enter`

## nvim
- `nvim-server` launches nvim (vnvim config) with a session-scoped `--listen` socket when run inside tmux
- `nvr <file>` (from any pane in the same tmux session) opens the file in the session's nvim-server
- Socket path: `$XDG_RUNTIME_DIR/nvim/<session>.sock` (fallback `/tmp/nvim/<session>.sock`)
- Add annotations: `nvim --server "$XDG_RUNTIME_DIR/nvim/<session>.sock" --remote-expr 'luaeval("vim.api.nvim_buf_set_extmark(0, vim.api.nvim_create_namespace(\"annotations\"), <line>, 0, { virt_lines = {{{\" ⚡ <text>\", \"Annotation\"}}}, virt_lines_above = false })")'`
