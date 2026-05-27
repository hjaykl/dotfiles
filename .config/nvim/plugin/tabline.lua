function _G.Tabline()
  local parts = {}
  for i = 1, vim.fn.tabpagenr("$") do
    local buflist = vim.fn.tabpagebuflist(i)
    local winnr = vim.fn.tabpagewinnr(i)
    local bufnr = buflist[winnr]
    local name = vim.api.nvim_buf_get_name(bufnr)
    local label = name ~= "" and vim.fn.fnamemodify(name, ":t") or "[No Name]"
    if name:match("%[base%]") or name:match("%[head%]") then
      label = label .. " (diff)"
    end
    local modified = vim.bo[bufnr].modified and " ●" or ""
    local hl = i == vim.fn.tabpagenr() and "%#TabLineSel#" or "%#TabLine#"
    parts[#parts + 1] = string.format("%s %d %s%s ", hl, i, label, modified)
  end
  parts[#parts + 1] = "%#TabLineFill#"
  return table.concat(parts)
end

vim.o.tabline = "%!v:lua.Tabline()"
