local map = vim.keymap.set

map('n', '<leader>pc', ':let @+ = expand("%:p")<CR>',
  { desc = "Copy filepath to clipboard", noremap = true, silent = true })
map("n", "<leader>d", vim.diagnostic.open_float, { desc = "Show diagnostic" })
map("n", "<leader>-", "<C-W>s", { desc = "Split Window Below", remap = true })
map("n", "<leader>|", "<C-W>v", { desc = "Split Window Right", remap = true })
map("n", "<leader>wd", "<C-W>c", { desc = "Delete Window", remap = true })
map('n', '<BS>', '<C-^>', { desc = 'Switch to alternate buffer' })
map('t', '<C-w>', '<C-\\><C-n><C-w>', { desc = 'Window commands from terminal', noremap = true, silent = true })

map('t', '<Esc>', '<C-\\><C-n>', { desc = 'Exit terminal mode', noremap = true, silent = true })
map('t', '<C-e>', '<Esc>', { desc = 'Send Esc to terminal', noremap = true, silent = true })

local function toggle_qf()
  local qf_exists = false
  for _, win in pairs(vim.fn.getwininfo()) do
    if win["quickfix"] == 1 then
      qf_exists = true
    end
  end
  if qf_exists then
    vim.cmd("cclose")
  else
    vim.cmd("copen")
  end
end

map("n", "<leader>qq", toggle_qf, { desc = "Toggle Quickfix List" })

