MiniDeps.later(function()
  local minidiff = require("mini.diff")
  minidiff.setup({
    mappings = {
      apply = "gh",
      reset = "gH",
      textobject = "gh",
      goto_first = "<leader>gF",
      goto_prev = "<leader>gp",
      goto_next = "<leader>gn",
      goto_last = "<leader>gL",
    },
  })

  vim.keymap.set("n", "<leader>gd", function()
    minidiff.toggle_overlay(0)
  end, { desc = "Toggle diff overlay" })

  vim.keymap.set("n", "<C-y>", function()
    if minidiff.get_buf_data(0) then
      return "ghgh"
    end
    return "<C-y>"
  end, { desc = "Apply current hunk", expr = true, remap = true })
  vim.keymap.set("n", "<C-n>", function()
    if minidiff.get_buf_data(0) then
      return "gHgh"
    end
    return "<C-n>"
  end, { desc = "Reset current hunk", expr = true, remap = true })
end)
