MiniDeps.later(function()
  require("mini.bufremove").setup()

  vim.keymap.set("n", "<leader>bd", function()
    local buf = vim.api.nvim_get_current_buf()
    local wins = vim.fn.win_findbuf(buf)

    if #wins > 1 then
      -- Buffer is shown in multiple windows, just close this window
      vim.cmd("close")
    else
      -- Buffer only in this window, delete it but keep window open
      local buffers = vim.fn.getbufinfo({ buflisted = 1 })
      if #buffers > 1 then
        vim.cmd("bp")
      end
      vim.api.nvim_buf_delete(buf, { force = false })
    end
  end, { desc = "Delete Buffer" })
end)
