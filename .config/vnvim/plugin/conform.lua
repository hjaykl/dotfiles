vim.pack.add({ "https://github.com/stevearc/conform.nvim" })

require("conform").setup({
  formatters_by_ft = {
    lua             = { "stylua" },
    javascript      = { { "prettierd", "prettier" }, "eslint_d" },
    javascriptreact = { { "prettierd", "prettier" }, "eslint_d" },
    typescript      = { { "prettierd", "prettier" }, "eslint_d" },
    typescriptreact = { { "prettierd", "prettier" }, "eslint_d" },
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
