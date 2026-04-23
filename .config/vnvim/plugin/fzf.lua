-- fzf.vim integration
-- The plugin ships with the `fzf` binary; we just need to put its dir on rtp.

local fzf_bin = vim.fn.exepath("fzf")
if fzf_bin == "" then return end

vim.opt.runtimepath:append(vim.fn.fnamemodify(vim.fn.resolve(fzf_bin), ":h:h"))
vim.cmd("runtime! plugin/fzf.vim")

vim.g.fzf_colors = {
  fg       = { "fg", "Normal" },
  bg       = { "bg", "Normal" },
  hl       = { "fg", "Comment" },
  ["fg+"]  = { "fg", "CursorLine", "CursorColumn", "Normal" },
  ["bg+"]  = { "bg", "CursorLine", "CursorColumn" },
  ["hl+"]  = { "fg", "Statement" },
  info     = { "fg", "PreProc" },
  border   = { "fg", "FloatBorder" },
  prompt   = { "fg", "Conditional" },
  pointer  = { "fg", "Exception" },
  marker   = { "fg", "Keyword" },
  spinner  = { "fg", "Label" },
  header   = { "fg", "Comment" },
}

vim.g.fzf_layout = {
  window = { width = 0.9, height = 0.6, border = "rounded" },
}

vim.keymap.set("n", "<leader>ff", "<cmd>FZF<cr>", { desc = "Find files" })
