MiniDeps.later(function()
  MiniDeps.add({
    source = "esmuellert/nvim-eslint",
  })

  require("nvim-eslint").setup({
    settings = {
      format = true,
    },
  })
end)
