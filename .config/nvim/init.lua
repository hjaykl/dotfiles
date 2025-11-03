require('config.options')
require('config.keymaps')
require('config.deps')
require('config.lsp')

local function require_directory(path)
  local full_path = vim.fn.stdpath("config") .. "/lua/" .. path:gsub("%.", "/")
  local items = vim.fn.readdir(full_path)

  for _, item in ipairs(items) do
    local item_path = full_path .. "/" .. item

    if vim.fn.isdirectory(item_path) == 1 then
      -- Recursively load subdirectories
      require_directory(path .. "." .. item)
    elseif item:match("%.lua$") and item ~= "init.lua" then
      -- Load Lua files
      local module_name = item:gsub('%.lua$', '')
      require(path .. "." .. module_name)
    end
  end
end

require_directory("plugins")

vim.cmd("colorscheme vague")
