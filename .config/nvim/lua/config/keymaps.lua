local map = vim.keymap.set

map("n", "<leader>pc", function()
  local filepath = vim.fn.expand("%:p")
  vim.fn.setreg("+", filepath)
  vim.notify("Copied: " .. filepath, vim.log.levels.INFO)
end, { desc = "Copy filepath to clipboard", silent = true })

map("n", "<leader>d", vim.diagnostic.open_float, { desc = "Show diagnostic" })
map("n", "<leader>-", "<C-W>s", { desc = "Split Window Below", remap = true })
map("n", "<leader>|", "<C-W>v", { desc = "Split Window Right", remap = true })
map("n", "<leader>wd", "<C-W>c", { desc = "Delete Window", remap = true })
map("n", "<BS>", "<C-^>", { desc = "Switch to alternate buffer" })

local function open_or_focus_qf()
  local qf_winid = nil
  for _, win in pairs(vim.fn.getwininfo()) do
    if win["quickfix"] == 1 then
      qf_winid = win["winid"]
      break
    end
  end

  if qf_winid then
    vim.fn.win_gotoid(qf_winid)
  else
    vim.cmd("copen")
  end
end

map("n", "<leader>q", open_or_focus_qf, { desc = "Open/Focus Quickfix List" })

vim.api.nvim_create_autocmd("FileType", {
  pattern = "qf",
  callback = function()
    vim.keymap.set("n", "q", ":cclose<CR>", { buffer = true, desc = "Close Quickfix" })
    vim.keymap.set("n", "<C-n>", "j", { buffer = true, desc = "Next item" })
    vim.keymap.set("n", "<C-p>", "k", { buffer = true, desc = "Previous item" })

    local function delete_qf_items(start_line, end_line)
      local qf_list = vim.fn.getqflist()
      for i = end_line, start_line, -1 do
        table.remove(qf_list, i)
      end
      vim.fn.setqflist(qf_list, "r")
      vim.fn.cursor(math.min(start_line, #qf_list), 1)
    end

    vim.keymap.set("n", "dd", function()
      local line = vim.fn.line(".")
      local count = vim.v.count1
      delete_qf_items(line, line + count - 1)
    end, { buffer = true, desc = "Delete quickfix item(s)" })

    vim.keymap.set("x", "d", function()
      local start_line = vim.fn.line("v")
      local end_line = vim.fn.line(".")
      if start_line > end_line then
        start_line, end_line = end_line, start_line
      end
      delete_qf_items(start_line, end_line)
    end, { buffer = true, desc = "Delete quickfix items" })
  end,
})
