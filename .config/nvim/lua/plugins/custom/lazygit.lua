MiniDeps.later(function()
  local function open_lazygit()
    local buf = vim.api.nvim_create_buf(false, true)
    local width = math.floor(vim.o.columns * 0.9)
    local height = math.floor(vim.o.lines * 0.9)
    local win = vim.api.nvim_open_win(buf, true, {
      relative = "editor",
      width = width,
      height = height,
      row = math.floor((vim.o.lines - height) / 2) - 2,
      col = math.floor((vim.o.columns - width) / 2),
      style = "minimal",
      border = "rounded",
    })

    vim.fn.termopen("lazygit", {
      on_exit = function()
        if vim.api.nvim_win_is_valid(win) then
          vim.api.nvim_win_close(win, true)
        end
        if vim.api.nvim_buf_is_valid(buf) then
          vim.api.nvim_buf_delete(buf, { force = true })
        end
      end,
    })

    vim.keymap.set('t', '<Esc>', '<Esc>', { buffer = buf, nowait = true })
    vim.cmd("startinsert")
  end

  vim.keymap.set('n', '<leader>gg', open_lazygit, { desc = 'Lazygit' })
end)
