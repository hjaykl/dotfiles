---@type vim.lsp.Config
return {
  cmd = { "sourcekit-lsp" },
  filetypes = { "swift" },
  root_dir = function(bufnr, on_dir)
    local root = vim.fs.root(bufnr, { "buildServer.json", ".bsp" })
      or vim.fs.root(bufnr, function(name)
        return name:match("%.xcodeproj$") or name:match("%.xcworkspace$")
      end)
      or vim.fs.root(bufnr, { "compile_commands.json", "Package.swift" })
      or vim.fs.root(bufnr, ".git")
      or vim.fn.getcwd()

    on_dir(root)
  end,
}
