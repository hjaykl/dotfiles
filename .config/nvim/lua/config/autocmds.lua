local augroup = vim.api.nvim_create_augroup('TerminalAutocmds', { clear = true })

vim.api.nvim_create_autocmd('BufEnter', {
  group = augroup,
  callback = function()
    if vim.bo.buftype == 'terminal' then
      vim.cmd('startinsert!')
    end
  end,
  desc = 'Enter Terminal mode automatically when entering a terminal buffer',
})

vim.api.nvim_create_autocmd('TermOpen', {
  group = augroup,
  callback = function()
    vim.keymap.set('n', '<CR>', 'A<CR>', { noremap = true, silent = true, buffer = 0 })
  end,
  desc = 'Pass through <CR> in normal mode in a terminal buffer',
})
