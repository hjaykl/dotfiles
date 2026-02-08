return {
  cmd = { "vtsls", "--stdio" },
  init_options = {
    hostInfo = "neovim",
  },
  filetypes = {
    "javascript",
    "javascriptreact",
    "javascript.jsx",
    "typescript",
    "typescriptreact",
    "typescript.tsx",
  },
  root_dir = function(bufnr, on_dir)
    -- Prioritize lockfiles (monorepo package root), then fall back to .git, then cwd
    local project_root = vim.fs.root(bufnr, { "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "bun.lock" })
      or vim.fs.root(bufnr, ".git")
      or vim.fn.getcwd()

    on_dir(project_root)
  end,
}
