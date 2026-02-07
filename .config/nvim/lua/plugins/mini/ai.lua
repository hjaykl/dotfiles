MiniDeps.later(function()
  local ai = require("mini.ai")

  ai.setup({
    custom_textobjects = {
      -- function body (treesitter)
      F = ai.gen_spec.treesitter({ a = "@function.outer", i = "@function.inner" }),
      -- class/type (treesitter)
      c = ai.gen_spec.treesitter({ a = "@class.outer", i = "@class.inner" }),
    },
  })
end)
