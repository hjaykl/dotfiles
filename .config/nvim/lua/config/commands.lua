vim.api.nvim_create_user_command("ReloadConfig", function()
  for key, _ in pairs(package.loaded) do
    if key:match("^config") or key:match("^plugins") then
      package.loaded[key] = nil
    end
  end
  vim.cmd("luafile " .. vim.fn.stdpath("config") .. "/init.lua")
  vim.notify("Neovim config reloaded!", vim.log.levels.INFO)
end, { desc = "Reload Neovim configuration" })
