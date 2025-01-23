return {
  {
    "neovim/nvim-lspconfig",
    dependencies = {
      {
        "folke/lazydev.nvim",
        ft = "lua", -- only load on lua files
        opts = {
          library = {
            -- Load luvit types when the `vim.uv` word is found
            { path = "${3rd}/luv/library", words = { "vim%.uv" } },
          },
        },
      },
    },
    config = function()
      -- Centralized on_attach function
      local on_attach = function(client, bufnr)
        local opts = { noremap = true, silent = true, buffer = bufnr }

        -- Guard against unsupported methods
        if client.supports_method("textDocument/codeAction") then
          vim.keymap.set("n", "<leader>ca", vim.lsp.buf.code_action, opts)
        end

        if client.supports_method("textDocument/definition") then
          vim.keymap.set("n", "gd", vim.lsp.buf.definition, opts)
        end

        if client.supports_method("textDocument/implementation") then
          vim.keymap.set("n", "gi", vim.lsp.buf.implementation, opts)
        end

        if client.supports_method("textDocument/rename") then
          vim.keymap.set("n", "<leader>rn", vim.lsp.buf.rename, opts)
        end

        -- Diagnostic navigation
        vim.keymap.set("n", "[d", vim.diagnostic.goto_prev, opts)
        vim.keymap.set("n", "]d", vim.diagnostic.goto_next, opts)
      end

      -- Set up LSP servers
      require("lspconfig").lua_ls.setup({
        on_attach = on_attach,
      })

      require("lspconfig").ts_ls.setup({
        on_attach = on_attach,
      })

      require 'lspconfig'.sourcekit.setup({
        on_attach = on_attach,
        root_dir = function(fname)
          return require('lspconfig.util').root_pattern("Package.swift", ".xcodeproj", ".git")(fname)
              or vim.fn.getcwd()
        end,
      })

      require("lspconfig").eslint.setup({
        on_attach = function(client, bufnr)
          -- Disable autoformat
          client.server_capabilities.documentFormattingProvider = false
          client.server_capabilities.documentRangeFormattingProvider = false

          -- Add manual eslint command
          vim.keymap.set("n", "<leader>l", function()
            vim.cmd("EslintFixAll")
            -- Force refresh diagnostics
            vim.diagnostic.reset(bufnr)
            vim.lsp.buf.format({ async = true })
          end, { noremap = true, silent = true, buffer = bufnr })

          -- Apply the rest of your standard LSP keybindings
          on_attach(client, bufnr)
        end,
        settings = {
          workingDirectory = { mode = "auto" },
          -- Prevent automatic linting
          validate = "manual",
          -- Disable running on every change
          run = "manual",
          -- Only run when manually triggered
          autoFixOnSave = false,
        },
        root_dir = require("lspconfig.util").root_pattern("project.json", ".eslintrc*", "package.json"),
      })

      -- Optional: Add more LSP server setups here with the same on_attach
    end,
  }
}
