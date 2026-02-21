MiniDeps.now(function()
  local mininotify = require("mini.notify")
  mininotify.setup({
    lsp_progress = { enable = false },
  })
  vim.notify = mininotify.make_notify()
end)
