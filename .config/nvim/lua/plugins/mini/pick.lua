MiniDeps.later(function()
  local minipick = require("mini.pick")
  minipick.setup({
    mappings = {
      choose_marked = "<C-q>",
    },
  })

  local extra = require("mini.extra")

  vim.keymap.set("n", "<leader>ff", minipick.builtin.files, { desc = "Find files" })
  vim.keymap.set("n", "<leader>fg", minipick.builtin.grep_live, { desc = "Live grep" })
  vim.keymap.set("n", "<leader>,", minipick.builtin.buffers, { desc = "Find buffers" })
  vim.keymap.set("n", "<leader>fh", minipick.builtin.help, { desc = "Find help" })
  vim.keymap.set("n", "<leader>fr", minipick.builtin.resume, { desc = "Resume last pick" })
  vim.keymap.set("n", "<leader>fd", extra.pickers.diagnostic, { desc = "Find diagnostics" })
  vim.keymap.set("n", "<leader>gh", function()
    extra.pickers.git_hunks({ n_context = 0 })
  end, { desc = "Git hunks" })
end)
