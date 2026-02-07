MiniDeps.later(function()
  require("mini.comment").setup({
    options = {
      custom_commentstring = function()
        local row = vim.fn.line(".") - 1
        local line = vim.api.nvim_buf_get_lines(0, row, row + 1, false)[1]
        local col = (line:find("%S") or 1) - 1
        local node = vim.treesitter.get_node({ pos = { row, col } })
        while node do
          if node:type():find("^jsx_") then
            return "{/* %s */}"
          end
          node = node:parent()
        end
      end,
    },
  })
end)
