-- Install Mini.nvim if not present
local path_package = vim.fn.stdpath('data') .. '/site'
local mini_path = path_package .. '/pack/deps/start/mini.nvim'
if not vim.loop.fs_stat(mini_path) then
	vim.cmd('echo "Installing `mini.nvim`" | redraw')
	local clone_cmd = {
		'git', 'clone', '--filter=blob:none',
		'https://github.com/echasnovski/mini.nvim', mini_path
	}
	vim.fn.system(clone_cmd)
	vim.cmd('packadd mini.nvim | helptags ALL')
end

vim.opt.number = true         -- Show the actual line number for the current line
vim.opt.relativenumber = true -- Enable relative line numbers

-- Set up 'mini.deps'
require('mini.deps').setup({ path = { package = path_package } })

-- Use 'mini.deps'. Helpers for staged startup
local add, now, later = MiniDeps.add, MiniDeps.now, MiniDeps.later

-- Tokyo Night-inspired theme for mini.hues
require('mini.hues').setup({
	background = '#1a1b26', -- Tokyo Night background (very dark blue)
	foreground = '#c0caf5', -- Tokyo Night foreground (light blue)
	accent = 'cyan', -- Accent color for highlights
	n_hues = 6,      -- Balanced number of hues
	saturation = 'medium', -- Medium saturation for a vibrant but not overwhelming look
})

-- Shared LSP `on_attach` function for auto-formatting
local on_attach = function(client, bufnr)
	if client.server_capabilities.documentFormattingProvider then
		vim.api.nvim_create_autocmd("BufWritePre", {
			buffer = bufnr,
			callback = function()
				vim.lsp.buf.format({ bufnr = bufnr })
			end,
		})
	end
end

now(function()
	-- Add LSP-related plugins
	add({
		source = 'neovim/nvim-lspconfig',
		depends = { 'williamboman/mason.nvim', 'williamboman/mason-lspconfig.nvim' },
	})

	-- Setup Mason
	require('mason').setup()
	require('mason-lspconfig').setup({
		ensure_installed = { "ts_ls", "gopls", "pyright", "lua_ls" }, -- Updated TypeScript LSP name
	})

	-- Automatically set up LSP servers
	local lspconfig = require('lspconfig')
	require('mason-lspconfig').setup_handlers({
		function(server_name)
			-- Custom setup for Lua LSP
			if server_name == "lua_ls" then
				lspconfig.lua_ls.setup({
					on_attach = on_attach,
					settings = {
						Lua = {
							runtime = { version = 'LuaJIT' }, -- Neovim's Lua version
							diagnostics = { globals = { 'vim' } }, -- Recognize `vim` as global
							workspace = {
								library = vim.api.nvim_get_runtime_file("", true), -- Include runtime files
								checkThirdParty = false,
							},
							telemetry = { enable = false }, -- Disable telemetry
						},
					},
				})
			else
				-- Default setup for other LSPs
				lspconfig[server_name].setup({ on_attach = on_attach })
			end
		end,
	})
end)

later(function()
	-- Add Treesitter plugin
	add({
		source = 'nvim-treesitter/nvim-treesitter',
		checkout = 'master',
		monitor = 'main',
		hooks = { post_checkout = function() vim.cmd('TSUpdate') end },
	})
	require('nvim-treesitter.configs').setup({
		ensure_installed = { 'lua', 'vimdoc', 'go' },
		highlight = { enable = true },
	})
end)

-- Additional Mini.nvim modules
require('mini.completion').setup() -- Autocompletion
require('mini.comment').setup()    -- Easy commenting
