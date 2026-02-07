MiniDeps.later(function()
  MiniDeps.add({
    source = "nvim-treesitter/nvim-treesitter",
    hooks = {
      post_checkout = function()
        vim.cmd("TSUpdate")
      end,
    },
  })

  require("nvim-treesitter").install({
    "go",
    "lua",
    "typescript",
    "tsx",
    "javascript",
    "jsdoc",
    "graphql",
    "css",
    "markdown",
    "markdown_inline",
    "json",
  })
end)
