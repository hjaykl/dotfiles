vim.g.mapleader = " "
vim.g.maplocalleader = "\\"
vim.opt.number = true         -- Show the actual line number for the current line
vim.opt.relativenumber = true -- Enable relative line numbers
vim.opt.clipboard = "unnamedplus"

vim.opt.tabstop = 4      -- Number of spaces that a <Tab> counts for
vim.opt.shiftwidth = 4   -- Number of spaces to use for each step of indent
vim.opt.softtabstop = 4  -- Number of spaces a <Tab> uses while editing
vim.opt.expandtab = true -- Use spaces instead of tabs

local path_package = vim.fn.stdpath('data') .. '/site'
local mini_path = path_package .. '/pack/deps/start/mini.nvim'
if not vim.loop.fs_stat(mini_path) then
  vim.cmd('echo "Installing `mini.nvim`" | redraw')
  local clone_cmd = {
    'git', 'clone', '--filter=blob:none',
    -- Uncomment next line to use 'stable' branch
    -- '--branch', 'stable',
    'https://github.com/echasnovski/mini.nvim', mini_path
  }
  vim.fn.system(clone_cmd)
  vim.cmd('packadd mini.nvim | helptags ALL')
end

-- Set up 'mini.deps' (customize to your liking)
require('mini.deps').setup({ path = { package = path_package } })

-- Use 'mini.deps'. `now()` and `later()` are helpers for a safe two-stage
-- startup and are optional.
local add, now, later = MiniDeps.add, MiniDeps.now, MiniDeps.later

now(function() require('mini.icons').setup() end)
now(function() require('mini.tabline').setup() end)
now(function() require('mini.statusline').setup() end)

later(function() require('mini.files').setup() end)
later(function() require('mini.comment').setup() end)
later(function() require('mini.completion').setup() end)
later(function() require('mini.pick').setup({
    mappings = {
      choose_marked = '<C-m>'
    }
  }
  ) end)

  -- Keybindings for Mini.files
vim.keymap.set('n', '<Leader>e', function()
  MiniFiles.open(vim.api.nvim_buf_get_name(0))
end, { desc = 'Open MiniFiles at current file' })
vim.keymap.set('n', '<Leader>E', ':lua MiniFiles.open()<CR>', { desc = 'Open MiniFiles' })
-- Bind Escape to close MiniFiles
vim.api.nvim_create_autocmd('FileType', {
  pattern = 'minifiles', -- Trigger only for MiniFiles
  callback = function()
    vim.keymap.set('n', '<Esc>', function()
      MiniFiles.close()
    end, { buffer = true, desc = 'Close MiniFiles picker' })
  end,
})

-- Keybindings for Mini.pick
vim.keymap.set('n', '<Leader>pp', ':Pick resume<CR>', { desc = 'Pick live grep' })
vim.keymap.set('n', '<Leader>pf', ':Pick files<CR>', { desc = 'Pick files' })
vim.keymap.set('n', '<Leader>pb', ':Pick buffers<CR>', { desc = 'Pick buffers' })
vim.keymap.set('n', '<Leader>pg', ':Pick grep_live<CR>', { desc = 'Pick live grep' })
vim.keymap.set('n', '<Leader>ph', ':Pick help<CR>', { desc = 'Pick live grep' })
vim.keymap.set('n', '<Leader>pm', ':Pick marks<CR>', { desc = 'Pick live grep' })
