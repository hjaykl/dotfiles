local map = vim.keymap.set

map('n', '<leader>pc', ':let @+ = expand("%:p")<CR>',
  { desc = "Copy filepath to clipboard", noremap = true, silent = true })
map("n", "<leader>d", vim.diagnostic.open_float, { desc = "Show diagnostic" })
map("n", "<leader>-", "<C-W>s", { desc = "Split Window Below", remap = true })
map("n", "<leader>|", "<C-W>v", { desc = "Split Window Right", remap = true })
map("n", "<leader>wd", "<C-W>c", { desc = "Delete Window", remap = true })
map('n', '<BS>', '<C-^>', { desc = 'Switch to alternate buffer' })
