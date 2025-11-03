-- lua/plugins/copilot.lua
MiniDeps.later(function()
  MiniDeps.add('zbirenbaum/copilot.lua')

  require('copilot').setup({
    suggestion = {
      enabled = true,
      auto_trigger = false,
      keymap = {
        accept = '<C-l>',
        next = '<C-j>',
        prev = '<C-S-j>',
        dismiss = '<C-e>',
      },
    },
    panel = { enabled = false },
    copilot_node_command = vim.fn.expand('~/.nvm/versions/node/v22.21.1/bin/node'),
  })

  vim.keymap.set('i', '<C-j>', function()
    require('copilot.suggestion').next()
  end, { desc = 'Copilot suggest' })
end)
