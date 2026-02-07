MiniDeps.later(function()
  local minifiles = require("mini.files")
  minifiles.setup({})

  vim.keymap.set("n", "<leader>e", function()
    local buf_name = vim.api.nvim_buf_get_name(0)
    -- Check if it's a real file (not empty, not a special buffer, and exists)
    if buf_name ~= "" and not buf_name:match("^%w+://") and vim.uv.fs_stat(buf_name) then
      minifiles.open(buf_name)
    else
      minifiles.open(vim.uv.cwd())
    end
  end, { desc = "Files at current file" })

  vim.keymap.set("n", "<leader>E", function()
    minifiles.open(vim.uv.cwd())
  end, { desc = "Files at root" })
end)
