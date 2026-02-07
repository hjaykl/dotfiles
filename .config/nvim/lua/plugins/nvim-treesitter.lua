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
    "vim",
    "php",
    "vue",
    "markdown",
    "markdown_inline",
    "elixir",
    "heex",
    "zig",
    "json",
  })
end)
