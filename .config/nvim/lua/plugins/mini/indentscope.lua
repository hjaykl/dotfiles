MiniDeps.later(function()
  local miniindentscope = require("mini.indentscope")

  miniindentscope.setup({
    draw = {
      delay = 10,
      animation = miniindentscope.gen_animation.none(),
    },
  })

  -- Disable for terminal buffers
  vim.api.nvim_create_autocmd("TermOpen", {
    callback = function()
      vim.b.miniindentscope_disable = true
    end,
  })
end)
