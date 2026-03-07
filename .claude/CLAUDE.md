# Environment

## tmux
- Run `tmux-status` to see active sessions, windows, and nvim sockets
- Read any pane silently: `tmux capture-pane -t session:window -p -S -50`
- Send commands to any pane: `tmux send-keys -t session:window "command" Enter`

## nvim
- Open a file in a running nvim and focus the window: `nvim-remote -s <session>:<window> <file>`
- Socket names match `tmux-status` output (e.g. `6-main`, `6-test`)
- Add annotations: `nvim --server /tmp/nvim-<name>.sock --remote-expr 'luaeval("vim.api.nvim_buf_set_extmark(0, vim.api.nvim_create_namespace(\"annotations\"), <line>, 0, { virt_lines = {{{\" ⚡ <text>\", \"Annotation\"}}}, virt_lines_above = false })")'`
