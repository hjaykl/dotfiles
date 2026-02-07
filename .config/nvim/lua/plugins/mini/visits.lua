MiniDeps.later(function()
  require("mini.visits").setup({})

  local visits = require("mini.visits")
  local extra = require("mini.extra")

  local function get_branch()
    local result = vim.fn.system("git rev-parse --abbrev-ref HEAD 2>/dev/null")
    if vim.v.shell_error ~= 0 then
      return nil
    end
    return vim.trim(result)
  end

  local function get_default_branch()
    local result = vim.fn.system("git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null")
    if vim.v.shell_error == 0 then
      return vim.trim(result):gsub("^refs/remotes/origin/", "")
    end
    -- Fallback: check for common default branch names (remote then local)
    for _, ref in ipairs({
      "refs/remotes/origin/main",
      "refs/remotes/origin/master",
      "refs/heads/main",
      "refs/heads/master",
    }) do
      vim.fn.system("git rev-parse --verify " .. ref .. " 2>/dev/null")
      if vim.v.shell_error == 0 then
        return ref:match("[^/]+$")
      end
    end
    return "core"
  end

  local function toggle_label(label)
    local path = vim.api.nvim_buf_get_name(0)
    local labels = visits.list_labels(path)
    if vim.tbl_contains(labels, label) then
      visits.remove_label(label, path)
      vim.notify("Removed label: " .. label)
    else
      visits.add_label(label, path)
      vim.notify("Added label: " .. label)
    end
  end

  local function toggle_slot(n)
    local label = tostring(n)
    local path = vim.api.nvim_buf_get_name(0)
    local existing = visits.list_paths("", { filter = label })
    -- If current file already has this slot, remove it
    if vim.tbl_contains(existing, path) then
      visits.remove_label(label, path)
      vim.notify("Slot " .. label .. " cleared")
      return
    end
    -- Otherwise, remove from any other file and assign to current
    for _, p in ipairs(existing) do
      visits.remove_label(label, p)
    end
    visits.add_label(label, path)
    vim.notify("Slot " .. label .. " → " .. vim.fn.fnamemodify(path, ":~:."))
  end

  -- Browse all visited paths
  vim.keymap.set("n", "<leader>fv", extra.pickers.visit_paths, { desc = "Visit paths" })

  -- Core labels (uses default branch name)
  vim.keymap.set("n", "<leader>lc", function()
    local branch = get_default_branch()
    toggle_label(branch)
  end, { desc = "Toggle core label" })

  vim.keymap.set("n", "<leader>vc", function()
    local branch = get_default_branch()
    extra.pickers.visit_paths({ filter = branch })
  end, { desc = "Visit core files" })

  -- Branch labels
  vim.keymap.set("n", "<leader>ll", function()
    local branch = get_branch()
    if not branch then
      return vim.notify("Not in a git repo", vim.log.levels.WARN)
    end
    toggle_label(branch)
  end, { desc = "Toggle branch label" })

  vim.keymap.set("n", "<leader>vv", function()
    local branch = get_branch()
    if not branch then
      return vim.notify("Not in a git repo", vim.log.levels.WARN)
    end
    extra.pickers.visit_paths({ filter = branch })
  end, { desc = "Visit branch files" })

  -- Clear all branch labels
  vim.keymap.set("n", "<leader>lD", function()
    local branch = get_branch() or "core"
    local paths = visits.list_paths("", { filter = branch })
    for _, p in ipairs(paths) do
      visits.remove_label(branch, p)
    end
    vim.notify("Cleared " .. #paths .. " files from label: " .. branch)
  end, { desc = "Clear branch labels" })

  -- Delete a label entirely
  vim.keymap.set("n", "<leader>ld", function()
    local labels = vim.tbl_filter(function(l)
      return not l:match("^%d$")
    end, visits.list_labels(""))
    if #labels == 0 then
      return vim.notify("No labels", vim.log.levels.WARN)
    end
    require("mini.pick").start({
      source = {
        items = labels,
        name = "Delete label",
        choose = function(label)
          vim.schedule(function()
            local paths = visits.list_paths("", { filter = label })
            for _, p in ipairs(paths) do
              visits.remove_label(label, p)
            end
            vim.notify("Deleted label: " .. label .. " (" .. #paths .. " files)")
          end)
        end,
      },
    })
  end, { desc = "Delete label" })

  -- Yank label: copy files from selected label into current branch label
  vim.keymap.set("n", "<leader>ly", function()
    local branch = get_branch()
    if not branch then
      return vim.notify("Not in a git repo", vim.log.levels.WARN)
    end
    local labels = vim.tbl_filter(function(l)
      return not l:match("^%d$") and l ~= branch
    end, visits.list_labels(""))
    if #labels == 0 then
      return vim.notify("No labels to yank from", vim.log.levels.WARN)
    end
    require("mini.pick").start({
      source = {
        items = labels,
        name = "Yank into " .. branch,
        choose = function(label)
          vim.schedule(function()
            local paths = visits.list_paths("", { filter = label })
            for _, p in ipairs(paths) do
              visits.add_label(branch, p)
            end
            vim.notify("Added " .. branch .. " label to " .. #paths .. " files from: " .. label)
          end)
        end,
      },
    })
  end, { desc = "Yank label into branch" })

  -- Browse all labels (excluding harpoon slots)
  vim.keymap.set("n", "<leader>va", function()
    local raw = visits.list_labels("")
    local labels = vim.tbl_filter(function(l)
      return not l:match("^%d$")
    end, raw)
    if #labels == 0 then
      return vim.notify("No labels", vim.log.levels.WARN)
    end
    require("mini.pick").start({
      source = {
        items = labels,
        name = "Labels",
        choose = function(label)
          vim.schedule(function()
            extra.pickers.visit_paths({ filter = label })
          end)
        end,
      },
    })
  end, { desc = "Visit labels" })

  -- Clear all harpoon slots
  vim.keymap.set("n", "<leader>l0", function()
    local count = 0
    for i = 1, 9 do
      local label = tostring(i)
      local paths = visits.list_paths("", { filter = label })
      for _, p in ipairs(paths) do
        visits.remove_label(label, p)
        count = count + 1
      end
    end
    vim.notify("Cleared " .. count .. " harpoon slots")
  end, { desc = "Clear all harpoon slots" })

  -- Harpoon slots
  for i = 1, 9 do
    vim.keymap.set("n", "<leader>l" .. i, function()
      toggle_slot(i)
    end, { desc = "Toggle slot " .. i })
    vim.keymap.set("n", "<leader>" .. i, function()
      local paths = visits.list_paths("", { filter = tostring(i) })
      if #paths > 0 then
        local buf = vim.fn.bufnr(paths[1])
        if buf ~= -1 and vim.api.nvim_buf_is_loaded(buf) then
          vim.api.nvim_set_current_buf(buf)
        else
          vim.cmd.edit(paths[1])
        end
      end
    end, { desc = "Jump to slot " .. i })
  end
end)
