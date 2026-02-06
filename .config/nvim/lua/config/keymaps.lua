local map = vim.keymap.set

map('n', '<leader>pc', ':let @+ = expand("%:p")<CR>',
  { desc = "Copy filepath to clipboard", noremap = true, silent = true })

map('n', '<leader>cf', function()
  local filepath = vim.fn.expand('%:p')
  vim.fn.setreg('+', '@' .. filepath)
  vim.notify('Copied: @' .. filepath, vim.log.levels.INFO)
end, { desc = "Copy @ reference to clipboard", noremap = true, silent = true })

map('n', '<leader>ct', function()
  local filepath = vim.fn.expand('%:p')
  local line = vim.fn.line('.')
  local ref = '@' .. filepath .. ':L' .. line
  vim.fn.setreg('+', ref)
  vim.notify('Copied: ' .. ref, vim.log.levels.INFO)
end, { desc = "Copy @ reference with line to clipboard", noremap = true, silent = true })

map('v', '<leader>ct', function()
  local filepath = vim.fn.expand('%:p')
  local start_line = vim.fn.line('v')
  local end_line = vim.fn.line('.')
  if start_line > end_line then
    start_line, end_line = end_line, start_line
  end
  local ref = '@' .. filepath .. ':L' .. start_line .. '-' .. end_line
  vim.fn.setreg('+', ref)
  vim.notify('Copied: ' .. ref, vim.log.levels.INFO)
end, { desc = "Copy @ reference with line range to clipboard", noremap = true, silent = true })

map("n", "<leader>d", vim.diagnostic.open_float, { desc = "Show diagnostic" })
map("n", "<leader>-", "<C-W>s", { desc = "Split Window Below", remap = true })
map("n", "<leader>|", "<C-W>v", { desc = "Split Window Right", remap = true })
map("n", "<leader>wd", "<C-W>c", { desc = "Delete Window", remap = true })
map('n', '<BS>', '<C-^>', { desc = 'Switch to alternate buffer' })

local function toggle_qf()
  local qf_winid = nil
  for _, win in pairs(vim.fn.getwininfo()) do
    if win["quickfix"] == 1 then
      qf_winid = win["winid"]
      break
    end
  end
  
  if qf_winid then
    local current_win = vim.fn.win_getid()
    if current_win == qf_winid then
      vim.cmd("cclose")
    else
      vim.fn.win_gotoid(qf_winid)
    end
  else
    vim.cmd("copen")
  end
end

map("n", "<leader>q", toggle_qf, { desc = "Toggle Quickfix List" })

