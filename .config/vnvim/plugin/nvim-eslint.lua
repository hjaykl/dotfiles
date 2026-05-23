vim.pack.add({ "https://github.com/esmuellert/nvim-eslint" })

require("nvim-eslint").setup({
  settings = {
    format = true,
  },
})
