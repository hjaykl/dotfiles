MiniDeps.later(function()
  local function git_diff_to_qf()
    -- Check if git is available and we are in a repo
    if vim.fn.system("git rev-parse --is-inside-work-tree"):match("true") == nil then
       vim.notify("Not a git repository.", vim.log.levels.WARN)
       return
    end
    
    local qf_list = {}

    -- Get tracked changed files
    local tracked = vim.fn.systemlist("git diff --name-only --relative HEAD")
    for _, file in ipairs(tracked) do
      if file ~= "" then
        table.insert(qf_list, {
          filename = file,
          lnum = 1,
          text = "Modified"
        })
      end
    end

    -- Add untracked files
    local untracked = vim.fn.systemlist("git ls-files --others --exclude-standard")
    for _, file in ipairs(untracked) do
      if file ~= "" then
        table.insert(qf_list, {
          filename = file,
          lnum = 1,
          text = "Untracked"
        })
      end
    end

    if #qf_list == 0 then
      vim.notify("No changed files found.", vim.log.levels.INFO)
      return
    end

    vim.fn.setqflist(qf_list, 'r') -- 'r' to replace existing list
    vim.cmd("copen")
  end

  vim.api.nvim_create_user_command("GitDiffQf", git_diff_to_qf, { desc = "Populate quickfix with git diff files" })
  vim.keymap.set("n", "<leader>gq", git_diff_to_qf, { desc = "Git Diff to Quickfix" })
end)
