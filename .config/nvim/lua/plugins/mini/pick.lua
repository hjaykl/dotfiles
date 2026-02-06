MiniDeps.later(function()
  local minipick = require('mini.pick')
  minipick.setup({
    mappings = {
      choose_marked = '<C-q>',
    }
  })

  vim.keymap.set("n", "<leader>ff", MiniPick.builtin.files, { desc = "Find files" })
  vim.keymap.set("n", "<leader>fg", MiniPick.builtin.grep_live, { desc = "Live grep" })
  vim.keymap.set("n", "<leader>fb", MiniPick.builtin.buffers, { desc = "Find buffers" })
  vim.keymap.set("n", "<leader>,", MiniPick.builtin.buffers, { desc = "Find buffers" })
  vim.keymap.set("n", "<leader>fh", MiniPick.builtin.help, { desc = "Find help" })
  vim.keymap.set("n", "<leader>fr", MiniPick.builtin.resume, { desc = "Resume last pick" })
end)
