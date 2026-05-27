vim.diagnostic.config({
  virtual_text = false,
  severity_sort = true,
  float = { border = "rounded", source = true },
})

vim.api.nvim_create_autocmd("LspAttach", {
  callback = function(ev)
    local client = vim.lsp.get_client_by_id(ev.data.client_id)
    if client then
      -- kill semantic tokens; treesitter covers highlighting
      client.server_capabilities.semanticTokensProvider = nil

      if client:supports_method("textDocument/completion") then
        vim.lsp.completion.enable(true, client.id, ev.buf, { autotrigger = true })
      end
    end
    vim.keymap.set("n", "gd", vim.lsp.buf.definition, { buffer = ev.buf, desc = "Goto Definition" })
  end,
})

vim.lsp.enable({ "lua_ls", "vtsls", "eslint" })
