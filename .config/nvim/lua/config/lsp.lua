vim.diagnostic.config({
  virtual_text = false,
  signs = true,
  underline = true,
  update_in_insert = false,
  float = { border = "rounded" },
})

-- Delete the default gr* keymaps
pcall(vim.keymap.del, "n", "grr")
pcall(vim.keymap.del, "n", "gra")
pcall(vim.keymap.del, "n", "grn")
pcall(vim.keymap.del, "n", "gri")
pcall(vim.keymap.del, "n", "grt")

local inline_completion_enabled = true

vim.api.nvim_create_autocmd("LspAttach", {
  callback = function(ev)
    local bufnr = ev.buf
    local client = assert(vim.lsp.get_client_by_id(ev.data.client_id))

    if client:supports_method("textDocument/completion") then
      vim.lsp.completion.enable(true, client.id, ev.buf, { autotrigger = true })
    end

    if
      vim.lsp.inline_completion
      and client:supports_method(vim.lsp.protocol.Methods.textDocument_inlineCompletion, bufnr)
    then
      vim.lsp.inline_completion.enable(inline_completion_enabled, { bufnr = bufnr })

      vim.keymap.set(
        "i",
        "<C-l>",
        vim.lsp.inline_completion.get,
        { desc = "LSP: accept inline completion", buffer = bufnr }
      )
      vim.keymap.set(
        "i",
        "<C-j>",
        vim.lsp.inline_completion.select,
        { desc = "LSP: switch inline completion", buffer = bufnr }
      )
      local function set_inline_keymap(bufnr_)
        local enabled = vim.lsp.inline_completion.is_enabled({ bufnr = bufnr_ })
        local desc = enabled and "Disable" or "Enable"
        vim.keymap.set("n", "<leader>ci", function()
          inline_completion_enabled = not inline_completion_enabled
          for _, buf in ipairs(vim.api.nvim_list_bufs()) do
            if vim.lsp.inline_completion.is_enabled({ bufnr = buf }) ~= inline_completion_enabled then
              vim.lsp.inline_completion.enable(inline_completion_enabled, { bufnr = buf })
              set_inline_keymap(buf)
            end
          end
          vim.notify("Inline completion " .. (inline_completion_enabled and "enabled" or "disabled"))
        end, { desc = desc .. " inline completion", buffer = bufnr_ })
      end
      set_inline_keymap(bufnr)
    end

    vim.keymap.set("n", "gd", vim.lsp.buf.definition, { buffer = ev.buf, desc = "Goto Definition" })
    vim.keymap.set("n", "gD", vim.lsp.buf.declaration, { buffer = ev.buf, desc = "Goto Declaration" })
    vim.keymap.set("n", "gI", vim.lsp.buf.implementation, { buffer = ev.buf, desc = "Goto Implementation" })
    vim.keymap.set("n", "gy", vim.lsp.buf.type_definition, { buffer = ev.buf, desc = "Goto Type Definition" })
    vim.keymap.set("n", "gr", vim.lsp.buf.references, { buffer = ev.buf, desc = "Goto References" })
    vim.keymap.set("n", "K", vim.lsp.buf.hover, { buffer = ev.buf, desc = "Hover" })
    vim.keymap.set("n", "gK", vim.lsp.buf.signature_help, { buffer = ev.buf, desc = "Signature Help" })
    vim.keymap.set("i", "<C-k>", vim.lsp.buf.signature_help, { buffer = ev.buf, desc = "Signature Help" })

    vim.keymap.set({ "n", "v" }, "<leader>ca", vim.lsp.buf.code_action, { buffer = ev.buf, desc = "Code Action" })
    vim.keymap.set("n", "<leader>cr", vim.lsp.buf.rename, { buffer = ev.buf, desc = "Rename" })
  end,
})
