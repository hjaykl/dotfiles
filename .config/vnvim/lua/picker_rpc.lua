-- RPC bridge for tmux fzf popups that drive this nvim instance.
-- Called from shell scripts via `nvim --server <sock> --remote-expr ...`.
local M = {}

-- Tab-separated lines: `<bufnr>\t<pretty_path>\t<absolute_path>`,
-- MRU-sorted, listed buffers only, named buffers only.
function M.buffer_list()
  local infos = vim.fn.getbufinfo({ buflisted = 1 })
  infos = vim.tbl_filter(function(b) return b.name ~= "" end, infos)
  table.sort(infos, function(a, b) return a.lastused > b.lastused end)
  local out = {}
  for _, b in ipairs(infos) do
    local pretty = vim.fn.fnamemodify(b.name, ":~:.")
    out[#out + 1] = b.bufnr .. "\t" .. pretty .. "\t" .. b.name
  end
  return table.concat(out, "\n")
end

function M.switch_buffer(bufnr)
  bufnr = tonumber(bufnr)
  if not bufnr or not vim.api.nvim_buf_is_valid(bufnr) then return false end
  vim.api.nvim_set_current_buf(bufnr)
  return true
end

return M
