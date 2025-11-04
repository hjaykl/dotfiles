MiniDeps.later(function()
  MiniDeps.add({
    source = 'folke/sidekick.nvim',
  })

  local sidekick = require('sidekick')

  local sidekickcli = require('sidekick.cli')


  sidekick.setup()

  vim.keymap.set("n", "<C-l>", sidekick.nes_jump_or_apply, { desc = "Goto/Apply Next Edit Suggestion" })

  -- Toggle Sidekick
  vim.keymap.set({ "n", "t", "i", "x" }, "<C-.>", sidekickcli.toggle, { desc = "Sidekick Toggle" })
  vim.keymap.set("n", "<leader>aa", sidekickcli.toggle, { desc = "Sidekick Toggle CLI" })

  -- Select and Close
  vim.keymap.set("n", "<leader>as", sidekickcli.select, { desc = "Select CLI" })
  vim.keymap.set("n", "<leader>ad", sidekickcli.close, { desc = "Detach a CLI Session" })

  -- Send Commands
  vim.keymap.set({ "x", "n" }, "<leader>at", function()
    sidekickcli.send({ msg = "{this}" })
  end, { desc = "Send This" })

  vim.keymap.set("n", "<leader>af", function()
    sidekickcli.send({ msg = "{file}" })
  end, { desc = "Send File" })

  vim.keymap.set("x", "<leader>av", function()
    sidekickcli.send({ msg = "{selection}" })
  end, { desc = "Send Visual Selection" })

  -- Prompts
  vim.keymap.set({ "n", "x" }, "<leader>ap", sidekickcli.prompt, { desc = "Sidekick Select Prompt" })
end)
