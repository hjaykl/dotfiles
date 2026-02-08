MiniDeps.later(function()
  local dev_path = vim.fn.expand("~/Dev/alleyoop")
  if vim.uv.fs_stat(dev_path) then
    vim.opt.rtp:prepend(dev_path)
  else
    MiniDeps.add({ source = "hjaykl/alleyoop.nvim" })
  end
  require("alleyoop").setup()
end)
