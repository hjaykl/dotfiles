MiniDeps.later(function()
  require("mini.bufremove").setup()

  vim.keymap.set("n", "<leader>bd", MiniBufremove.delete, { desc = "Delete Buffer" })
end)
