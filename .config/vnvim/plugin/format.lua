-- Single BufWritePre pipeline: eslint fixAll → LSP format → prettierd fallback.
-- Order matters: eslint must apply fixes before formatting, and prettierd
-- is a filetype-scoped fallback for things no LSP formats.

local PRETTIER_FILETYPES = {
  markdown = true,
  json = true,
  yaml = true,
  css = true,
  html = true,
  graphql = true,
}

local function run_eslint_fixall(bufnr)
  local client = vim.lsp.get_clients({ bufnr = bufnr, name = "eslint" })[1]
  if not client then return end

  local params = vim.lsp.util.make_range_params(0, client.offset_encoding)
  params.context = { only = { "source.fixAll.eslint" }, diagnostics = {} }

  local results = vim.lsp.buf_request_sync(bufnr, "textDocument/codeAction", params, 2000) or {}
  for _, res in pairs(results) do
    for _, action in ipairs(res.result or {}) do
      if action.edit then
        vim.lsp.util.apply_workspace_edit(action.edit, client.offset_encoding)
      end
    end
  end
end

-- vtsls advertises formatting but shouldn't own the lane for JS/TS
local function run_lsp_format(bufnr)
  vim.lsp.buf.format({
    bufnr = bufnr,
    timeout_ms = 2000,
    filter = function(c) return c.name ~= "vtsls" end,
  })
end

local function run_prettierd(bufnr)
  if not PRETTIER_FILETYPES[vim.bo[bufnr].filetype] then return end
  if vim.fn.executable("prettierd") == 0 then return end

  local lines = vim.api.nvim_buf_get_lines(bufnr, 0, -1, false)
  local content = table.concat(lines, "\n")

  local result = vim.system(
    { "prettierd", vim.api.nvim_buf_get_name(bufnr) },
    { stdin = content, text = true }
  ):wait()

  if result.code ~= 0 then
    vim.notify("prettierd: " .. (result.stderr or "failed"):gsub("%s+$", ""), vim.log.levels.WARN)
    return
  end

  local formatted = vim.split(result.stdout, "\n", { plain = true })
  if formatted[#formatted] == "" then
    table.remove(formatted)
  end

  if not vim.deep_equal(lines, formatted) then
    vim.api.nvim_buf_set_lines(bufnr, 0, -1, false, formatted)
  end
end

vim.api.nvim_create_autocmd("BufWritePre", {
  callback = function(ev)
    run_eslint_fixall(ev.buf)
    run_lsp_format(ev.buf)
    run_prettierd(ev.buf)
  end,
})
