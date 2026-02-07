MiniDeps.later(function()
  MiniDeps.add({
    source = "trevorhauter/gitportal.nvim",
  })

  local gitportal = require("gitportal")

  -- Opens the current file in your browser at the correct branch/commit.
  -- When in visual mode, selected lines are included in the permalink.
  vim.keymap.set("n", "<leader>gb", gitportal.open_file_in_browser, { desc = "Open in browser" })
  vim.keymap.set("v", "<leader>gb", gitportal.open_file_in_browser, { desc = "Open in browser" })

  -- Opens a Githost link directly in Neovim, optionally switching to the branch/commit.
  vim.keymap.set("n", "<leader>gl", gitportal.open_file_in_neovim, { desc = "Open link in Neovim" })

  -- Generates and copies the permalink of your current file to your clipboard.
  -- When in visual mode, selected lines are included in the permalink.
  vim.keymap.set("n", "<leader>gc", gitportal.copy_link_to_clipboard, { desc = "Copy permalink" })
  vim.keymap.set("v", "<leader>gc", gitportal.copy_link_to_clipboard, { desc = "Copy permalink" })
end)
