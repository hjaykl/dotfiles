MiniDeps.later(function()
  local function parse_diff_hunks(diff_output)
    local qf_list = {}
    local current_file = nil
    
    for _, line in ipairs(diff_output) do
      -- Extract filename from diff header
      local file = line:match("^%+%+%+ b/(.*)")
      if file then
        current_file = file
      end
      
      -- Parse hunk header to get line number
      local new_start = line:match("^@@ %-(%d+),?%d* %+(%d+),?%d* @@")
      if new_start and current_file then
        local lnum = tonumber(new_start)
        
        -- Extract context from hunk header if present
        local context = line:match("^@@ .-@@ (.*)")
        local text = context and context:gsub("^%s+", "") or "Modified"
        
        table.insert(qf_list, {
          filename = current_file,
          lnum = lnum,
          text = text ~= "" and text or "Modified"
        })
      end
    end
    
    return qf_list
  end

  local function git_diff_to_qf()
    -- Check if git is available and we are in a repo
    if vim.fn.system("git rev-parse --is-inside-work-tree"):match("true") == nil then
       vim.notify("Not a git repository.", vim.log.levels.WARN)
       return
    end
    
    local qf_list = {}

    -- Get unstaged changes (git diff HEAD)
    local unstaged_diff = vim.fn.systemlist("git diff --relative HEAD")
    local unstaged_hunks = parse_diff_hunks(unstaged_diff)
    for _, entry in ipairs(unstaged_hunks) do
      table.insert(qf_list, entry)
    end

    -- Get staged changes (git diff --cached)
    local staged_diff = vim.fn.systemlist("git diff --cached --relative")
    local staged_hunks = parse_diff_hunks(staged_diff)
    for _, entry in ipairs(staged_hunks) do
      entry.text = "[Staged] " .. entry.text
      table.insert(qf_list, entry)
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
