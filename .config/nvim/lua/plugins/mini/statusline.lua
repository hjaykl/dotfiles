MiniDeps.now(function()
  local ministatusline = require("mini.statusline")
  ministatusline.setup({
    content = {
      active = function()
        local mode, mode_hl = ministatusline.section_mode({ trunc_width = 120 })
        local git = ministatusline.section_git({ trunc_width = 40 })
        local diff = ministatusline.section_diff({ trunc_width = 75 })
        local diagnostics = ministatusline.section_diagnostics({ trunc_width = 75 })
        local lsp = ministatusline.section_lsp({ trunc_width = 75 })
        local filename = ministatusline.section_filename({ trunc_width = 140 })
        local fileinfo = ministatusline.section_fileinfo({ trunc_width = 120 })
        local location = ministatusline.section_location({ trunc_width = 75 })
        local search = ministatusline.section_searchcount({ trunc_width = 75 })

        local copilot_icon = "\u{ec1e}"
        local copilot_hl = vim.g.inline_completion_enabled and "MiniStatuslineCopilotOn" or "MiniStatuslineCopilotOff"

        return ministatusline.combine_groups({
          { hl = mode_hl, strings = { mode } },
          { hl = "MiniStatuslineDevinfo", strings = { git, diff, diagnostics, lsp } },
          "%<",
          { hl = "MiniStatuslineFilename", strings = { filename } },
          "%=",
          { hl = copilot_hl, strings = { copilot_icon } },
          { hl = "MiniStatuslineFileinfo", strings = { fileinfo } },
          { hl = mode_hl, strings = { search, location } },
        })
      end,
    },
  })

  vim.api.nvim_create_autocmd("ColorScheme", {
    callback = function()
      local fileinfo_bg = vim.api.nvim_get_hl(0, { name = "MiniStatuslineFileinfo" }).bg
      vim.api.nvim_set_hl(0, "MiniStatuslineCopilotOn", { fg = vim.api.nvim_get_hl(0, { name = "DiagnosticWarn" }).fg, bg = fileinfo_bg, bold = true })
      vim.api.nvim_set_hl(0, "MiniStatuslineCopilotOff", { fg = vim.api.nvim_get_hl(0, { name = "Comment" }).fg, bg = fileinfo_bg })
    end,
  })
end)
