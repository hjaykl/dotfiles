MiniDeps.later(function()
  require("mini.visits").setup({})

  local visits = require("mini.visits")
  local extra = require("mini.extra")

  vim.keymap.set("n", "<leader>vv", extra.pickers.visit_paths, { desc = "Visit paths" })
  vim.keymap.set("n", "<leader>vl", extra.pickers.visit_labels, { desc = "Visit labels" })

  vim.keymap.set("n", "<leader>va", function()
    local label = vim.fn.input("Label: ")
    if label ~= "" then
      visits.add_label(label, vim.api.nvim_buf_get_name(0))
    end
  end, { desc = "Add label" })

  vim.keymap.set("n", "<leader>vd", function()
    vim.ui.select(visits.list_labels(vim.api.nvim_buf_get_name(0)), {
      prompt = "Remove:",
    }, function(choice)
      if choice then
        visits.remove_label(choice, vim.api.nvim_buf_get_name(0))
      end
    end)
  end, { desc = "Delete label" })
end)
