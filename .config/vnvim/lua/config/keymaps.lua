local map = vim.keymap.set

map("n", "<leader>pc", function()
  local filepath = vim.fn.expand("%:p")
  vim.fn.setreg("+", filepath)
  vim.notify("Copied: " .. filepath, vim.log.levels.INFO)
end, { desc = "Copy filepath to clipboard", silent = true })

map("n", "<leader>d", vim.diagnostic.open_float, { desc = "Show diagnostic" })
map("n", "<BS>", "<C-^>", { desc = "Switch to alternate buffer" })
