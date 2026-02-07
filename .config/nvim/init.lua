require("config.options")
require("config.keymaps")
require("config.deps")
require("config.lsp")

local function require_directory(path)
  local full_path = vim.fn.stdpath("config") .. "/lua/" .. path:gsub("%.", "/")
  local items = vim.fn.readdir(full_path)

  for _, item in ipairs(items) do
    local item_path = full_path .. "/" .. item

    if vim.fn.isdirectory(item_path) == 1 then
      -- Recursively load subdirectories
      require_directory(path .. "." .. item)
    elseif item:match("%.lua$") and item ~= "init.lua" then
      local module_name = item:gsub("%.lua$", "")
      local ok, err = pcall(require, path .. "." .. module_name)
      if not ok then
        vim.notify("Failed to load " .. path .. "." .. module_name .. ": " .. err, vim.log.levels.ERROR)
      end
    end
  end
end

require_directory("plugins")

vim.cmd("colorscheme vague")
