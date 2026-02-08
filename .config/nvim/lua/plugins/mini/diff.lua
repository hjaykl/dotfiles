MiniDeps.later(function()
  local minidiff = require("mini.diff")
  minidiff.setup({})

  vim.keymap.set("n", "<leader>gd", function()
    minidiff.toggle_overlay(0)
  end, { desc = "Toggle diff overlay" })

  vim.keymap.set("n", "<C-s>", "ghgh", { desc = "Stage hunk", remap = true })
  vim.keymap.set("n", "<C-x>", "gHgh", { desc = "Reset hunk", remap = true })
end)
