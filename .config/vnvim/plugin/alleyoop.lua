-- alleyoop.nvim: prefer local dev clone if present, else vim.pack-managed.
local dev_path = vim.fn.expand("~/Dev/alleyoop")

if vim.uv.fs_stat(dev_path) then
  vim.opt.rtp:prepend(dev_path)
else
  vim.pack.add({ "https://github.com/hjaykl/alleyoop.nvim" })
end

require("alleyoop").setup()
