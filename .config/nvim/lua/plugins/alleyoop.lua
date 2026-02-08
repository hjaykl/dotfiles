MiniDeps.later(function()
  vim.opt.rtp:prepend(vim.fn.expand("~/Dev/alleyoop"))
  require("alleyoop").setup()
end)
