return { {
	"neovim/nvim-lspconfig",
	dependencies = {
		{
			"folke/lazydev.nvim",
			ft = "lua", -- only load on lua files
			opts = {
				library = {
					-- See the configuration section for more details
					-- Load luvit types when the `vim.uv` word is found
					{ path = "${3rd}/luv/library", words = { "vim%.uv" } },
				},
			},
		},
	},
	config = function()
		require("lspconfig").lua_ls.setup({})
		require("lspconfig").ts_ls.setup({})
		require("lspconfig").eslint.setup({
			settings = {
				workingDirectory = { mode = "auto" }, -- Automatically resolve closest ESLint config
			},
			root_dir = require("lspconfig.util").root_pattern("project.json", ".eslintrc*", "package.json"),
			on_attach = function(client, bufnr)
				-- vim.api.nvim_create_autocmd("BufWritePre", {
				-- 	buffer = bufnr,
				-- 	command = "EslintFixAll",
				-- })
				vim.api.nvim_buf_set_keymap(
					bufnr,
					"n",
					"<leader>f",
					"<cmd>EslintFixAll<CR>",
					{ noremap = true, silent = true }
				)

				vim.api.nvim_buf_set_keymap(
					bufnr,
					"n",
					"<leader>ca",
					"<cmd>lua vim.lsp.buf.code_action()<CR>",
					{ noremap = true, silent = true }
				)
				vim.api.nvim_buf_set_keymap(
					bufnr,
					"v",
					"<leader>ca",
					"<cmd>lua vim.lsp.buf.range_code_action()<CR>",
					{ noremap = true, silent = true }
				)
			end,
		})

		vim.api.nvim_create_autocmd('LspAttach', {
			callback = function(args)
				local client = vim.lsp.get_client_by_id(args.data.client_id)
				if not client then return end
				-- if client.supports_method('textDocument/formatting') then
				-- 	-- Create a keymap for vim.lsp.buf.rename()
				-- 	vim.api.nvim_create_autocmd('BufWritePre', {
				-- 		buffer = args.buf,
				-- 		callback = function()
				-- 			vim.lsp.buf.format({ bufnr = args.buf, id = client.id })
				-- 		end
				-- 	})
				-- end
			end,
		})
	end
} }
