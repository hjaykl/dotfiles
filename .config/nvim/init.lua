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

-- Set leader key to space
vim.g.mapleader = ' '
vim.g.maplocalleader = ' '

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

add({
	source = 'yetone/avante.nvim',
	monitor = 'main',
	depends = {
		'stevearc/dressing.nvim',
		'nvim-lua/plenary.nvim',
		'MunifTanjim/nui.nvim',
		'echasnovski/mini.icons'
	},
	hooks = { post_checkout = function() vim.cmd('make') end }
})
--- optional
add({ source = 'hrsh7th/nvim-cmp' })
add({ source = 'HakonHarnes/img-clip.nvim' })
add({ source = 'MeanderingProgrammer/render-markdown.nvim' })

later(function() require('render-markdown').setup({}) end)
later(function()
	require('img-clip').setup({}) -- config img-clip
	require("avante").setup({
		provider = "openai",
		api_key = vim.env.OPENAI_API_KEY
	}) -- config for avante.nvim
end)

now(function()
	require('mini.icons').setup()
	require('mini.tabline').setup()
	require('mini.pick').setup()
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
	require('avante_lib').load()
end);

later(function()
	local miniclue = require('mini.clue')
	miniclue.setup({
		triggers = {
			-- Leader triggers
			{ mode = 'n', keys = '<Leader>' },
			{ mode = 'x', keys = '<Leader>' },

			-- Built-in completion
			{ mode = 'i', keys = '<C-x>' },

			-- `g` key
			{ mode = 'n', keys = 'g' },
			{ mode = 'x', keys = 'g' },

			-- Marks
			{ mode = 'n', keys = "'" },
			{ mode = 'n', keys = '`' },
			{ mode = 'x', keys = "'" },
			{ mode = 'x', keys = '`' },

			-- Registers
			{ mode = 'n', keys = '"' },
			{ mode = 'x', keys = '"' },
			{ mode = 'i', keys = '<C-r>' },
			{ mode = 'c', keys = '<C-r>' },

			-- Window commands
			{ mode = 'n', keys = '<C-w>' },

			-- `z` key
			{ mode = 'n', keys = 'z' },
			{ mode = 'x', keys = 'z' },
		},

		clues = {
			-- Enhance this by adding descriptions for <Leader> mapping groups
			miniclue.gen_clues.builtin_completion(),
			miniclue.gen_clues.g(),
			miniclue.gen_clues.marks(),
			miniclue.gen_clues.registers(),
			miniclue.gen_clues.windows(),
			miniclue.gen_clues.z(),
		},
	})
	-- Additional Mini.nvim modules
	require('mini.completion').setup() -- Autocompletion
	require('mini.comment').setup() -- Easy commenting
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


-- Key mappings for Telescope
vim.api.nvim_set_keymap('n', '<Leader>ff', ':Telescope find_files<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<Leader>fg', ':Telescope live_grep<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<Leader>fb', ':Telescope buffers<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<Leader>fh', ':Telescope help_tags<CR>', { noremap = true, silent = true })


vim.api.nvim_set_keymap('n', '<Leader>pf', ':Pick files<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<Leader>pb', ':Pick buffers<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<Leader>pg', ':Pick grep_live<CR>', { noremap = true, silent = true })

-- Function to reload nvim config
function ReloadConfig()
	for name, _ in pairs(package.loaded) do
		if name:match("^user") or name:match("^plugins") then
			package.loaded[name] = nil
		end
	end
	dofile(vim.env.MYVIMRC)
end

vim.api.nvim_set_keymap('n', '<Leader>r', ':lua ReloadConfig()<CR>', { noremap = true, silent = true })
