do return end -- disabled in favor of ~/Dev/composer plugin
MiniDeps.later(function()
  local map = vim.keymap.set
  local chain = {}

  -- Storage

  local global_library_dir = vim.fn.stdpath("data") .. "/composer/library"
  local history_dir = vim.fn.stdpath("data") .. "/composer/history"
  local max_history = 50

  local function get_local_library_dir()
    local root = vim.fs.root(0, { ".composer" })
    if root then
      return root .. "/.composer"
    end
    return nil
  end

  local function read_file(path)
    local f = io.open(path, "r")
    if not f then
      return nil
    end
    local content = f:read("*a")
    f:close()
    return content
  end

  local function write_file(path, content)
    vim.fn.mkdir(vim.fn.fnamemodify(path, ":h"), "p")
    local f = io.open(path, "w")
    if not f then
      return
    end
    f:write(content)
    f:close()
  end

  local function glob_prompts(dir)
    if vim.fn.isdirectory(dir) == 0 then
      return {}
    end
    local files = vim.fn.glob(dir .. "/**/*.md", false, true)
    local prompts = {}
    for _, file in ipairs(files) do
      local name = file:sub(#dir + 2):gsub("%.md$", "")
      prompts[name] = file
    end
    return prompts
  end

  local function get_library_items()
    local items = {}
    -- Global prompts
    local global = glob_prompts(global_library_dir)
    for name, path in pairs(global) do
      table.insert(items, { name = name, path = path, scope = "global" })
    end
    -- Local prompts
    local local_dir = get_local_library_dir()
    if local_dir then
      local local_prompts = glob_prompts(local_dir)
      for name, path in pairs(local_prompts) do
        table.insert(items, { name = name, path = path, scope = "local" })
      end
    end
    table.sort(items, function(a, b)
      if a.scope ~= b.scope then
        return a.scope == "local"
      end
      return a.name < b.name
    end)
    return items
  end

  -- History

  local function get_history_files()
    if vim.fn.isdirectory(history_dir) == 0 then
      return {}
    end
    local files = vim.fn.glob(history_dir .. "/*.md", false, true)
    table.sort(files)
    return files
  end

  local function load_history()
    local files = get_history_files()
    local entries = {}
    for _, file in ipairs(files) do
      local content = read_file(file)
      if content then
        table.insert(entries, content)
      end
    end
    return entries
  end

  local function save_history_entry(content)
    vim.fn.mkdir(history_dir, "p")
    local timestamp = os.date("%Y%m%d-%H%M%S")
    write_file(history_dir .. "/" .. timestamp .. ".md", content)
    -- Prune old entries
    local files = get_history_files()
    while #files > max_history do
      os.remove(files[1])
      table.remove(files, 1)
    end
  end

  local history = load_history()

  -- Ref builders

  local function ref_file()
    return "@" .. vim.fn.expand("%:p")
  end

  local function ref_line()
    return "@" .. vim.fn.expand("%:p") .. ":L" .. vim.fn.line(".")
  end

  local function get_visual_range()
    local start_line = vim.fn.line("v")
    local end_line = vim.fn.line(".")
    if start_line > end_line then
      start_line, end_line = end_line, start_line
    end
    return start_line, end_line
  end

  local function ref_line_range()
    local s, e = get_visual_range()
    return "@" .. vim.fn.expand("%:p") .. ":L" .. s .. "-" .. e
  end

  local function ref_line_range_content()
    local s, e = get_visual_range()
    local lines = vim.api.nvim_buf_get_lines(0, s - 1, e, false)
    local ft = vim.bo.filetype
    return "@"
      .. vim.fn.expand("%:p")
      .. ":L"
      .. s
      .. "-"
      .. e
      .. "\n\n```"
      .. ft
      .. "\n"
      .. table.concat(lines, "\n")
      .. "\n```"
  end

  local function ref_line_diagnostics()
    local line = vim.fn.line(".")
    local ref = "@" .. vim.fn.expand("%:p") .. ":L" .. line
    local diagnostics = vim.diagnostic.get(0, { lnum = line - 1 })
    if #diagnostics > 0 then
      ref = ref .. "\n\nDiagnostics:"
      for i, d in ipairs(diagnostics) do
        local source = d.source and (" [" .. d.source .. "]") or ""
        ref = ref .. "\n" .. i .. ". " .. d.message .. source
      end
    end
    return ref
  end

  local function ref_buf_diagnostics()
    local diagnostics = vim.diagnostic.get(0)
    if #diagnostics == 0 then
      vim.notify("No diagnostics in buffer", vim.log.levels.INFO)
      return nil
    end
    local ref = "@" .. vim.fn.expand("%:p") .. "\n\nDiagnostics:"
    for i, d in ipairs(diagnostics) do
      local source = d.source and (" [" .. d.source .. "]") or ""
      local severity = vim.diagnostic.severity[d.severity] or "?"
      ref = ref .. "\n" .. i .. ". L" .. (d.lnum + 1) .. ": " .. severity .. " " .. d.message .. source
    end
    return ref
  end

  local function ref_quickfix()
    local qf_list = vim.fn.getqflist()
    if #qf_list == 0 then
      vim.notify("Quickfix list is empty", vim.log.levels.INFO)
      return nil
    end
    local lines = {}
    for _, item in ipairs(qf_list) do
      local filename = item.bufnr > 0 and vim.fn.bufname(item.bufnr) or item.filename or ""
      table.insert(lines, filename .. ":" .. item.lnum .. ": " .. item.text)
    end
    return table.concat(lines, "\n")
  end

  -- Actions

  local function copy_ref(ref)
    vim.fn.setreg("+", ref)
    vim.notify("Copied: " .. ref, vim.log.levels.INFO)
  end

  local function chain_ref(ref)
    table.insert(chain, ref)
    vim.notify("Chain (" .. #chain .. "): " .. ref:sub(1, 60), vim.log.levels.INFO)
  end

  local function clear_chain()
    chain = {}
    vim.notify("Cleared AI ref chain", vim.log.levels.INFO)
  end

  -- Prompt builder

  local function set_buf_content(buf, win, content)
    local lines = vim.split(content, "\n", { plain = true })
    vim.api.nvim_buf_set_lines(buf, 0, -1, false, lines)
    vim.api.nvim_win_set_cursor(win, { #lines, #lines[#lines] })
  end

  local function update_title(win, index)
    local title = " Composer "
    if #history > 0 and index <= #history then
      title = " Composer (" .. index .. "/" .. #history .. ") "
    elseif #history > 0 then
      title = " Composer (new | " .. #history .. " saved) "
    end
    vim.api.nvim_win_set_config(win, { title = title, title_pos = "center" })
  end

  local function open_prompt_builder()
    local width = math.floor(vim.o.columns * 0.8)
    local height = math.floor(vim.o.lines * 0.6)
    local buf = vim.api.nvim_create_buf(false, true)

    local win = vim.api.nvim_open_win(buf, true, {
      relative = "editor",
      width = width,
      height = height,
      row = math.floor((vim.o.lines - height) / 2) - 1,
      col = math.floor((vim.o.columns - width) / 2),
      border = "rounded",
      title = " Composer ",
      title_pos = "center",
      footer = " :w copy | <C-p>/<C-n> history | <C-l> save to library | q cancel ",
      footer_pos = "center",
    })

    vim.api.nvim_buf_set_name(buf, "composer://prompt")
    vim.bo[buf].filetype = "markdown"
    vim.bo[buf].buftype = "acwrite"
    vim.bo[buf].bufhidden = "wipe"
    vim.treesitter.start(buf, "markdown")
    vim.wo[win].wrap = true
    vim.wo[win].linebreak = true

    -- Start with chain content or empty (new prompt)
    local current_index = #history + 1
    if #chain > 0 then
      set_buf_content(buf, win, table.concat(chain, "\n\n"))
    end
    update_title(win, current_index)

    local function close()
      if vim.api.nvim_win_is_valid(win) then
        vim.api.nvim_win_close(win, true)
      end
    end

    local function save()
      local content = table.concat(vim.api.nvim_buf_get_lines(buf, 0, -1, false), "\n")
      vim.fn.setreg("+", content)
      table.insert(history, content)
      save_history_entry(content)
      chain = {}
      close()
      vim.notify("Prompt copied to clipboard", vim.log.levels.INFO)
    end

    local function save_to_library()
      local local_dir = get_local_library_dir()
      local function do_save(dir, scope)
        vim.ui.input({ prompt = "Prompt name: " }, function(name)
          if not name or name == "" then
            return
          end
          local content = table.concat(vim.api.nvim_buf_get_lines(buf, 0, -1, false), "\n")
          write_file(dir .. "/" .. name .. ".md", content)
          vim.notify("Saved to " .. scope .. " library: " .. name, vim.log.levels.INFO)
        end)
      end

      if local_dir then
        vim.ui.select({ "Project (.composer/)", "Global" }, { prompt = "Save to:" }, function(choice)
          if not choice then
            return
          end
          if choice:match("^Project") then
            do_save(local_dir, "project")
          else
            do_save(global_library_dir, "global")
          end
        end)
      else
        do_save(global_library_dir, "global")
      end
    end

    vim.api.nvim_create_autocmd("BufWriteCmd", {
      buffer = buf,
      callback = save,
    })

    map("n", "<C-p>", function()
      if #history == 0 then
        return
      end
      current_index = current_index - 1
      if current_index < 1 then
        current_index = 1
      end
      set_buf_content(buf, win, history[current_index])
      update_title(win, current_index)
    end, { buffer = buf, desc = "Previous prompt" })

    map("n", "<C-n>", function()
      if current_index > #history then
        return
      end
      current_index = current_index + 1
      if current_index > #history then
        local draft = #chain > 0 and table.concat(chain, "\n\n") or ""
        set_buf_content(buf, win, draft)
      else
        set_buf_content(buf, win, history[current_index])
      end
      update_title(win, current_index)
    end, { buffer = buf, desc = "Next prompt" })

    map("n", "<C-l>", save_to_library, { buffer = buf, desc = "Save to library" })
    map("n", "q", close, { buffer = buf })
  end

  -- Direct copy keymaps
  map("n", "<leader>af", function()
    copy_ref(ref_file())
  end, { desc = "Copy @ file ref", silent = true })
  map("n", "<leader>at", function()
    copy_ref(ref_line())
  end, { desc = "Copy @ line ref", silent = true })
  map("v", "<leader>at", function()
    copy_ref(ref_line_range())
  end, { desc = "Copy @ line range ref", silent = true })
  map("v", "<leader>av", function()
    copy_ref(ref_line_range_content())
  end, { desc = "Copy @ ref with content", silent = true })
  map("n", "<leader>ad", function()
    copy_ref(ref_line_diagnostics())
  end, { desc = "Copy @ ref with diagnostics", silent = true })
  map("n", "<leader>aD", function()
    local ref = ref_buf_diagnostics()
    if ref then
      copy_ref(ref)
    end
  end, { desc = "Copy @ ref with all diagnostics", silent = true })
  map("n", "<leader>aq", function()
    local ref = ref_quickfix()
    if ref then
      copy_ref(ref)
    end
  end, { desc = "Copy quickfix to clipboard", silent = true })

  -- Chain keymaps
  map("n", "<leader>acf", function()
    chain_ref(ref_file())
  end, { desc = "Chain @ file ref", silent = true })
  map("n", "<leader>act", function()
    chain_ref(ref_line())
  end, { desc = "Chain @ line ref", silent = true })
  map("v", "<leader>act", function()
    chain_ref(ref_line_range())
  end, { desc = "Chain @ line range ref", silent = true })
  map("v", "<leader>acv", function()
    chain_ref(ref_line_range_content())
  end, { desc = "Chain @ ref with content", silent = true })
  map("n", "<leader>acd", function()
    chain_ref(ref_line_diagnostics())
  end, { desc = "Chain @ ref with diagnostics", silent = true })
  map("n", "<leader>acD", function()
    local ref = ref_buf_diagnostics()
    if ref then
      chain_ref(ref)
    end
  end, { desc = "Chain @ ref with all diagnostics", silent = true })
  map("n", "<leader>acq", function()
    local ref = ref_quickfix()
    if ref then
      chain_ref(ref)
    end
  end, { desc = "Chain quickfix", silent = true })
  map("n", "<leader>ax", clear_chain, { desc = "Clear ref chain", silent = true })

  -- Prompt builder
  map("n", "<leader>ap", open_prompt_builder, { desc = "Prompt builder" })

  -- Library browser
  map("n", "<leader>al", function()
    local items = get_library_items()
    if #items == 0 then
      return vim.notify("Library is empty", vim.log.levels.INFO)
    end
    local display = vim.tbl_map(function(item)
      local prefix = item.scope == "local" and "[local] " or ""
      return prefix .. item.name
    end, items)
    require("mini.pick").start({
      source = {
        items = display,
        name = "Prompt Library",
        choose = function(selected)
          vim.schedule(function()
            -- Find the matching item
            for _, item in ipairs(items) do
              local prefix = item.scope == "local" and "[local] " or ""
              if prefix .. item.name == selected then
                local content = read_file(item.path)
                if content then
                  chain = { content }
                  open_prompt_builder()
                end
                break
              end
            end
          end)
        end,
      },
    })
  end, { desc = "Browse prompt library", silent = true })

  -- Library delete
  map("n", "<leader>aL", function()
    local items = get_library_items()
    if #items == 0 then
      return vim.notify("Library is empty", vim.log.levels.INFO)
    end
    local display = vim.tbl_map(function(item)
      local prefix = item.scope == "local" and "[local] " or ""
      return prefix .. item.name
    end, items)
    require("mini.pick").start({
      source = {
        items = display,
        name = "Delete from library",
        choose = function(selected)
          vim.schedule(function()
            for _, item in ipairs(items) do
              local prefix = item.scope == "local" and "[local] " or ""
              if prefix .. item.name == selected then
                os.remove(item.path)
                vim.notify("Deleted: " .. item.name, vim.log.levels.INFO)
                break
              end
            end
          end)
        end,
      },
    })
  end, { desc = "Delete from library", silent = true })
end)
