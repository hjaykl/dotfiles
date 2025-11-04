local NODE_VERSION = "22" -- Change this to use different Node version

local handle = io.popen('bash -c "source ~/.nvm/nvm.sh && nvm which ' .. NODE_VERSION .. '"')
if handle then
  local node_path = handle:read("*a")
  handle:close()
  if node_path and node_path ~= "" then
    local node_dir = vim.fn.fnamemodify(vim.trim(node_path), ':h')
    vim.env.PATH = node_dir .. ':' .. vim.env.PATH
  else
    vim.notify("Failed to find Node " .. NODE_VERSION .. " via nvm", vim.log.levels.WARN)
  end
else
  vim.notify("Failed to execute nvm command", vim.log.levels.WARN)
end
