return {
  -- Mason for managing external installations (LSP servers, linters, etc.)
  {
    "williamboman/mason.nvim",
    build = ":MasonUpdate", -- optional: ensures registry is up-to-date
    config = function()
      require("mason").setup({
        -- your custom settings if needed
      })
    end,
  },

  -- Bridges mason.nvim with lspconfig
  {
    "williamboman/mason-lspconfig.nvim",
    dependencies = { "williamboman/mason.nvim", "neovim/nvim-lspconfig" },
    config = function()
      require("mason-lspconfig").setup({
        -- list any servers you want to ensure installed.
        ensure_installed = { "lua_ls", "ts_ls", "eslint" },
        -- You can set automatic_installation to true if desired:
        -- automatic_installation = true,
      })
    end,
  },
}
