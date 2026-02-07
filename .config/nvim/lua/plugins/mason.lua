MiniDeps.now(function()
  MiniDeps.add({
    source = "mason-org/mason.nvim",
  })
  MiniDeps.add({
    source = "neovim/nvim-lspconfig",
  })
  MiniDeps.add({
    source = "mason-org/mason-lspconfig.nvim",
    depends = {
      "mason-org/mason.nvim",
      "neovim/nvim-lspconfig",
    },
  })

  require("mason").setup()

  require("mason-lspconfig").setup({
    automatic_enable = true,
    ensure_installed = {
      "lua_ls",
      "vtsls",
      "copilot",
    },
  })
end)
