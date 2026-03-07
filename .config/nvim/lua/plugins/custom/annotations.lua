local ns = vim.api.nvim_create_namespace("annotations")
local hidden = {}
local map = vim.keymap.set
local hl = "Annotation"

vim.api.nvim_set_hl(0, hl, { fg = "#7e98e8", bg = "#1e2030", italic = true })
vim.api.nvim_create_autocmd("ColorScheme", {
  callback = function()
    vim.api.nvim_set_hl(0, hl, { fg = "#7e98e8", bg = "#1e2030", italic = true })
  end,
})

local function get_note_on_line(bufnr, line)
  local marks = vim.api.nvim_buf_get_extmarks(bufnr, ns, { line, 0 }, { line, -1 }, { details = true })
  return marks[1]
end

local function get_note_text(mark)
  local opts = mark[4]
  if opts.virt_lines and opts.virt_lines[1] and opts.virt_lines[1][1] then
    return opts.virt_lines[1][1][1]:match("^%s*⚡ (.+)$") or opts.virt_lines[1][1][1]
  end
  return ""
end

map("n", "<leader>nn", function()
  local bufnr = vim.api.nvim_get_current_buf()

  if hidden[bufnr] then
    for _, mark in ipairs(hidden[bufnr]) do
      vim.api.nvim_buf_set_extmark(bufnr, ns, mark.line, mark.col, mark.opts)
    end
    hidden[bufnr] = nil
    vim.notify("Notes shown", vim.log.levels.INFO)
  else
    local marks = vim.api.nvim_buf_get_extmarks(bufnr, ns, 0, -1, { details = true })
    if #marks == 0 then
      return vim.notify("No notes", vim.log.levels.WARN)
    end
    hidden[bufnr] = {}
    for _, mark in ipairs(marks) do
      local opts = mark[4]
      opts.id = nil
      opts.ns_id = nil
      table.insert(hidden[bufnr], { line = mark[2], col = mark[3], opts = opts })
    end
    vim.api.nvim_buf_clear_namespace(bufnr, ns, 0, -1)
    vim.notify("Notes hidden", vim.log.levels.INFO)
  end
end, { desc = "Toggle notes" })

map("n", "<leader>na", function()
  local bufnr = vim.api.nvim_get_current_buf()
  local line = vim.api.nvim_win_get_cursor(0)[1] - 1
  vim.ui.input({ prompt = "Note: " }, function(text)
    if not text or text == "" then
      return
    end
    vim.api.nvim_buf_set_extmark(bufnr, ns, line, 0, {
      virt_lines = { { { "  ⚡ " .. text, hl } } },
      virt_lines_above = false,
    })
  end)
end, { desc = "Add note" })

map("n", "<leader>ne", function()
  local bufnr = vim.api.nvim_get_current_buf()
  local line = vim.api.nvim_win_get_cursor(0)[1] - 1
  local mark = get_note_on_line(bufnr, line)
  if not mark then
    return vim.notify("No note on this line", vim.log.levels.WARN)
  end
  local current_text = get_note_text(mark)
  vim.ui.input({ prompt = "Edit note: ", default = current_text }, function(text)
    if not text then
      return
    end
    if text == "" then
      vim.api.nvim_buf_del_extmark(bufnr, ns, mark[1])
      return
    end
    local opts = mark[4]
    opts.id = mark[1]
    opts.virt_lines = { { { "  ⚡ " .. text, opts.virt_lines[1][1][2] or hl } } }
    vim.api.nvim_buf_set_extmark(bufnr, ns, line, 0, opts)
  end)
end, { desc = "Edit note" })

map("n", "<leader>nd", function()
  local bufnr = vim.api.nvim_get_current_buf()
  local line = vim.api.nvim_win_get_cursor(0)[1] - 1
  local mark = get_note_on_line(bufnr, line)
  if not mark then
    return vim.notify("No note on this line", vim.log.levels.WARN)
  end
  vim.api.nvim_buf_del_extmark(bufnr, ns, mark[1])
  vim.notify("Note deleted", vim.log.levels.INFO)
end, { desc = "Delete note" })
