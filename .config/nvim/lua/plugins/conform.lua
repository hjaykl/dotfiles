MiniDeps.later(function()
  MiniDeps.add({
    source = "stevearc/conform.nvim",
  })

  require("conform").setup({
    formatters_by_ft = {
      lua = { "stylua" },
      javascript = { "prettierd", "prettier", stop_after_first = true },
      typescript = { "prettierd", "prettier", stop_after_first = true },
      graphql = { "prettierd", "prettier", stop_after_first = true },
      json = { "prettierd", "prettier", stop_after_first = true },
    },
    format_on_save = {
      timeout_ms = 500,
      lsp_fallback = true,
    },
  })
end)
