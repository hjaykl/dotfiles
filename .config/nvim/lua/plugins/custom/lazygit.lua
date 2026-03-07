MiniDeps.later(function()
  local lazygit_state = {}

  local function close_float()
    if lazygit_state.win and vim.api.nvim_win_is_valid(lazygit_state.win) then
      vim.api.nvim_win_close(lazygit_state.win, true)
    end
    if lazygit_state.buf and vim.api.nvim_buf_is_valid(lazygit_state.buf) then
      vim.api.nvim_buf_delete(lazygit_state.buf, { force = true })
    end
    lazygit_state = {}
  end

  vim.api.nvim_create_user_command("LazygitEdit", function(opts)
    close_float()
    vim.cmd("edit " .. opts.args)
  end, { nargs = 1, complete = "file" })

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

    lazygit_state = { buf = buf, win = win }

    vim.fn.jobstart("lazygit", {
      term = true,
      env = { NVIM = vim.v.servername, EDITOR = "lazygit-edit" },
      on_exit = function()
        close_float()
      end,
    })

    vim.keymap.set("t", "<Esc>", "<Esc>", { buffer = buf, nowait = true })
    vim.cmd("startinsert")
  end

  vim.keymap.set("n", "<leader>gg", open_lazygit, { desc = "Lazygit" })
end)
