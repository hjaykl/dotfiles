local M = {}

function M.open_two(local_path, remote_path, display_name)
  display_name = display_name or "diff"
  local ft = vim.filetype.match({ filename = display_name }) or ""

  -- git difftool passes $LOCAL as base and $REMOTE as the new side.
  -- Match GitHub: base on the left, head on the right.
  local base_lines = vim.fn.readfile(local_path)
  local head_lines = vim.fn.readfile(remote_path)

  vim.cmd("tabnew")

  local base_buf = vim.api.nvim_get_current_buf()
  vim.bo[base_buf].buftype = "nofile"
  vim.bo[base_buf].bufhidden = "wipe"
  vim.bo[base_buf].swapfile = false
  vim.api.nvim_buf_set_lines(base_buf, 0, -1, false, base_lines)
  vim.api.nvim_buf_set_name(base_buf, "[base] " .. display_name)
  vim.bo[base_buf].filetype = ft
  vim.cmd("diffthis")

  vim.cmd("vnew")
  local head_buf = vim.api.nvim_get_current_buf()
  vim.bo[head_buf].buftype = "nofile"
  vim.bo[head_buf].bufhidden = "wipe"
  vim.bo[head_buf].swapfile = false
  vim.api.nvim_buf_set_lines(head_buf, 0, -1, false, head_lines)
  vim.api.nvim_buf_set_name(head_buf, "[head] " .. display_name)
  vim.bo[head_buf].filetype = ft
  vim.cmd("diffthis")
end

return M
