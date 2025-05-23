return { {
  'echasnovski/mini.nvim',
  version = false,
  config = function()
    local tabline = require 'mini.tabline'
    -- Keybindings for Mini.files
    vim.keymap.set('n', '<Leader>e', ':lua MiniFiles.open()<CR>', { desc = 'Open MiniFiles' })
    tabline.setup()

    local statusline = require 'mini.statusline'
    statusline.setup()

    local extra = require 'mini.extra'
    extra.setup()

    local icons = require 'mini.icons'
    icons.setup()

    local pick = require 'mini.pick'
    pick.setup({})

    -- Keybindings for Mini.pick
    vim.keymap.set('n', '<Leader>pp', ':Pick resume<CR>', { desc = 'Pick live grep' })
    vim.keymap.set('n', '<Leader>pf', ':Pick files<CR>', { desc = 'Pick files' })
    vim.keymap.set('n', '<Leader>pb', ':Pick buffers<CR>', { desc = 'Pick buffers' })
    vim.keymap.set('n', '<Leader>pg', ':Pick grep_live<CR>', { desc = 'Pick live grep' })
    vim.keymap.set('n', '<Leader>ph', ':Pick help<CR>', { desc = 'Pick live grep' })
    vim.keymap.set('n', '<Leader>pm', ':Pick marks<CR>', { desc = 'Pick live grep' })

    local files = require 'mini.files'
    files.setup()

    -- Keybindings for Mini.files
    -- Keybinding to open at the current file's directory
    vim.keymap.set('n', '<Leader>e', function()
      local MiniFiles = require("mini.files")
      local _ = MiniFiles.close()
          or MiniFiles.open(vim.api.nvim_buf_get_name(0), false)
      vim.defer_fn(function()
        MiniFiles.reveal_cwd()
      end, 30)
    end, { desc = 'Open MiniFiles at current file directory' })

    vim.keymap.set('n', '<Leader>E', ':lua MiniFiles.open()<CR>', { desc = 'Open MiniFiles' })

    -- Bind Escape to close MiniFiles
    vim.api.nvim_create_autocmd('FileType', {
      pattern = 'minifiles', -- Trigger only for MiniFiles
      callback = function()
        vim.keymap.set('n', '<Esc>', function()
          files.close()
        end, { buffer = true, desc = 'Close MiniFiles picker' })
      end,
    })

    local comment = require 'mini.comment'
    comment.setup()

    local completion = require 'mini.completion'
    completion.setup()

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
  end
},
}
