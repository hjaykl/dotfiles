-- eslint: run source.fixAll on save (synchronous, applies lint autofixes)
vim.api.nvim_create_autocmd("BufWritePre", {
  callback = function(ev)
    local clients = vim.lsp.get_clients({ bufnr = ev.buf, name = "eslint" })
    if #clients == 0 then return end

    local params = vim.lsp.util.make_range_params(0, clients[1].offset_encoding)
    params.context = { only = { "source.fixAll.eslint" }, diagnostics = {} }

    local results = vim.lsp.buf_request_sync(ev.buf, "textDocument/codeAction", params, 2000) or {}
    for _, res in pairs(results) do
      for _, action in ipairs(res.result or {}) do
        if action.edit then
          vim.lsp.util.apply_workspace_edit(action.edit, clients[1].offset_encoding)
        end
      end
    end
  end,
})

-- LSP format on save, excluding vtsls (advertises formatting but shouldn't own the lane for JS/TS)
vim.api.nvim_create_autocmd("BufWritePre", {
  callback = function(ev)
    vim.lsp.buf.format({
      bufnr = ev.buf,
      timeout_ms = 2000,
      filter = function(client) return client.name ~= "vtsls" end,
    })
  end,
})

-- Prettier fallback for filetypes where no LSP formats (md/json/yaml/css/html/graphql)
vim.api.nvim_create_autocmd("BufWritePre", {
  pattern = { "*.md", "*.json", "*.yaml", "*.yml", "*.css", "*.html", "*.graphql", "*.gql" },
  callback = function(ev)
    if vim.fn.executable("prettierd") == 0 then return end

    local bufnr = ev.buf
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
  end,
})
