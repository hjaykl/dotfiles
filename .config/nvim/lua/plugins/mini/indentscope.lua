MiniDeps.later(function()
  local miniindentscope = require('mini.indentscope')

  miniindentscope.setup({
    draw = {
      delay = 10,
      animation = miniindentscope.gen_animation.none()
    }
  })
end)
