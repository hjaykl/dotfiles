return {
	"folke/tokyonight.nvim",
	config = function()
		local colors = require("tokyonight").setup({
			transparent = true
		})
		vim.cmd.colorscheme "tokyonight"
	end,
	lazy = false,
	priority = 1000,
	opts = {},

}
