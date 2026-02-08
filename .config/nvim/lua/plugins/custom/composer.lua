MiniDeps.later(function()
  local map = vim.keymap.set
  local chain = {}

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
      footer = " :w copy & close | q cancel ",
      footer_pos = "center",
    })

    vim.api.nvim_buf_set_name(buf, "composer://prompt")
    vim.bo[buf].filetype = "markdown"
    vim.bo[buf].buftype = "acwrite"
    vim.bo[buf].bufhidden = "wipe"
    vim.treesitter.start(buf, "markdown")
    vim.wo[win].wrap = true
    vim.wo[win].linebreak = true

    if #chain > 0 then
      local content = table.concat(chain, "\n\n")
      local lines = vim.split(content, "\n", { plain = true })
      vim.api.nvim_buf_set_lines(buf, 0, -1, false, lines)
      vim.api.nvim_win_set_cursor(win, { #lines, #lines[#lines] })
    end

    local function close()
      if vim.api.nvim_win_is_valid(win) then
        vim.api.nvim_win_close(win, true)
      end
    end

    local function save()
      local content = table.concat(vim.api.nvim_buf_get_lines(buf, 0, -1, false), "\n")
      vim.fn.setreg("+", content)
      chain = {}
      close()
      vim.notify("Prompt copied to clipboard", vim.log.levels.INFO)
    end

    vim.api.nvim_create_autocmd("BufWriteCmd", {
      buffer = buf,
      callback = save,
    })
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
end)
