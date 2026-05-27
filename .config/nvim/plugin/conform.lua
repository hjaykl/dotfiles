vim.pack.add({ "https://github.com/stevearc/conform.nvim" })

require("conform").setup({
  formatters_by_ft = {
    lua             = { "stylua" },
    javascript      = { "prettierd", "eslint_d" },
    javascriptreact = { "prettierd", "eslint_d" },
    typescript      = { "prettierd", "eslint_d" },
    typescriptreact = { "prettierd", "eslint_d" },
    swift           = { "swift_format" },
    graphql         = { "prettierd", "prettier", stop_after_first = true },
    json            = { "prettierd", "prettier", stop_after_first = true },
    yaml            = { "prettierd", "prettier", stop_after_first = true },
    markdown        = { "prettierd", "prettier", stop_after_first = true },
    css             = { "prettierd", "prettier", stop_after_first = true },
    html            = { "prettierd", "prettier", stop_after_first = true },
  },
  format_on_save = {
    timeout_ms = 3000,
    lsp_format = "fallback",
  },
})
