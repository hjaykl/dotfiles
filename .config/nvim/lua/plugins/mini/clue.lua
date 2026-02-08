MiniDeps.later(function()
  local miniclue = require("mini.clue")
  miniclue.setup({
    triggers = {
      -- Leader triggers
      { mode = "n", keys = "<Leader>" },
      { mode = "x", keys = "<Leader>" },

      -- Built-in completion
      { mode = "i", keys = "<C-x>" },

      -- `g` key
      { mode = "n", keys = "g" },
      { mode = "x", keys = "g" },

      -- Marks
      { mode = "n", keys = "'" },
      { mode = "n", keys = "`" },
      { mode = "x", keys = "'" },
      { mode = "x", keys = "`" },

      -- Registers
      { mode = "n", keys = '"' },
      { mode = "x", keys = '"' },
      { mode = "i", keys = "<C-r>" },
      { mode = "c", keys = "<C-r>" },

      -- Window commands
      { mode = "n", keys = "<C-w>" },

      -- `z` key
      { mode = "n", keys = "z" },
      { mode = "x", keys = "z" },
    },

    clues = {
      miniclue.gen_clues.builtin_completion(),
      miniclue.gen_clues.g(),
      miniclue.gen_clues.marks(),
      miniclue.gen_clues.registers(),
      miniclue.gen_clues.windows(),
      miniclue.gen_clues.z(),

      { mode = "n", keys = "<Leader>a", desc = "+ai ref" },
      { mode = "n", keys = "<Leader>ac", desc = "+chain" },
      { mode = "n", keys = "<Leader>b", desc = "+buffer" },
      { mode = "n", keys = "<Leader>c", desc = "+code" },
      { mode = "n", keys = "<Leader>f", desc = "+find" },
      { mode = "n", keys = "<Leader>g", desc = "+git" },
      { mode = "n", keys = "<Leader>l", desc = "+labels" },
      { mode = "n", keys = "<Leader>p", desc = "+path" },
      { mode = "n", keys = "<Leader>v", desc = "+visits" },
      { mode = "n", keys = "<Leader>w", desc = "+window" },
      { mode = "v", keys = "<Leader>a", desc = "+ai ref" },
      { mode = "v", keys = "<Leader>ac", desc = "+chain" },
      { mode = "v", keys = "<Leader>c", desc = "+code" },
      { mode = "v", keys = "<Leader>g", desc = "+git" },
    },
  })
end)
