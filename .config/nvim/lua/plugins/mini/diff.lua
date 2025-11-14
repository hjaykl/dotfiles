MiniDeps.later(function()
  local minidiff = require('mini.diff')
  minidiff.setup({
    mappings = {
      apply = 'gh',
      reset = 'gH',
      textobject = 'gh',
      goto_first = '<leader>gF',
      goto_prev = '<leader>gp',
      goto_next = '<leader>gn',
      goto_last = '<leader>gL',
    },
  })

  vim.keymap.set('n', '<leader>gd', function()
    minidiff.toggle_overlay()
  end, { desc = 'Toggle diff overlay' })

  vim.keymap.set('n', '<C-y>', 'ghgh', { desc = 'Apply current hunk', remap = true })
  vim.keymap.set('n', '<C-n>', 'gHgh', { desc = 'Reset current hunk', remap = true })
end)
