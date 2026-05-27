---
name: add-language
description: Wire up a new language (LSP server + optional formatter) in the nvim config at ~/.dotfiles/.config/nvim. Lifts pre-written LSP configs from nvim-lspconfig's GitHub repo, installs the binary, and updates the enable list and conform formatters. Use when the user asks to add language support, set up <lang> in nvim, or enable a specific LSP server.
---

# add-language

This nvim config is plugin-light by design: built-in LSP via `vim.lsp.enable()` + `lsp/<server>.lua`, conform.nvim for formatting. No Mason, no nvim-lspconfig plugin. We *lift* configs from nvim-lspconfig's repo as a starting point so we don't have to look them up.

## Inputs

A language name ("Go", "Python") or a server name ("gopls", "pyright"). If a language has multiple plausible servers (e.g. Python: pyright / basedpyright / ruff / pyright + ruff together), ask the user which.

## Steps

### 1. Resolve to an LSP server name

Common map:
- Go → `gopls`
- Rust → `rust_analyzer`
- Python → `pyright` (types) and/or `ruff` (lint+format)
- C/C++ → `clangd`
- Bash → `bashls`
- Nix → `nil_ls` or `nixd`
- JSON/YAML → `jsonls` / `yamlls`
- Lua → `lua_ls` (already configured)
- JS/TS → `vtsls` (already configured)

If unsure, fetch the directory listing from `https://api.github.com/repos/neovim/nvim-lspconfig/contents/lsp` and ask the user to pick.

### 2. Research the recommended setup

Some languages' LSPs handle formatting/linting natively (Go, Rust); others need a separate tool (JS/TS needs prettier, Lua needs stylua). Don't guess — check.

Do a quick web lookup (WebSearch or WebFetch) for what's currently idiomatic. Useful queries:
- `neovim LSP setup <language> 2026`
- `<language> nvim formatter linter recommended`
- `<server-name> formatting capabilities` (does the LSP format natively?)

What you want to come away with:
- Which LSP is the modern default (e.g. `basedpyright` vs `pyright`, `nixd` vs `nil_ls`).
- Whether the LSP formats natively, or whether a conform formatter is needed.
- Whether a separate linter is conventional (rare — most modern LSPs include diagnostics).
- Any well-known gotchas (e.g. Python venv detection, monorepo root_dir issues).

If research is inconclusive, fall back to the table in step 7 and surface the uncertainty to the user.

### 3. Bail if already enabled

Read `~/.dotfiles/.config/nvim/lua/config/lsp_bootstrap.lua`. If the server name is already in the `vim.lsp.enable({ ... })` list, stop — it's already wired up. Mention this to the user and exit.

### 4. Lift the LSP config

Fetch:
```
https://raw.githubusercontent.com/neovim/nvim-lspconfig/master/lsp/<server>.lua
```

- 200 → proceed with the contents as the baseline.
- 404 → tell the user the server isn't in nvim-lspconfig. Ask whether to write the config from scratch (need `cmd`, `filetypes`, `root_markers` from their input or the server's docs).

### 5. Write `~/.dotfiles/.config/nvim/lsp/<server>.lua`

Adapt the lifted file:

- Add `---@type vim.lsp.Config` on the line before `return {`. Matches the style of `lsp/lua_ls.lua` and `lsp/vtsls.lua`.

- **Strip lspconfig dependencies.** Remove any `require 'lspconfig...'` lines (commonly `require 'lspconfig.util'` at the top). Rewrite `util.root_pattern(...)` calls using `vim.fs.root` — the function form supports globs:
  ```lua
  vim.fs.root(bufnr, function(name)
    return name:match("%.xcodeproj$") or name:match("%.xcworkspace$")
  end)
  ```
  Chain `or vim.fs.root(...)` calls to express priority (see the final `sourcekit.lua` for a reference). Without this rewrite the config will error at load with "module 'lspconfig.util' not found".

- Strip `on_attach`, `handlers`, and any setup that duplicates the global `LspAttach` autocmd in `lua/config/lsp_bootstrap.lua` (semantic tokens disable, completion enable, gd keymap).

- **`capabilities` is a judgement call, not always boilerplate.** If the block enables specific protocol features (e.g. `didChangeWatchedFiles.dynamicRegistration`, pull-diagnostics `textDocument.diagnostic`, `semanticTokens`), it's a protocol opt-in — keep it; nvim's defaults don't enable everything. Only strip if it's just `vim.lsp.protocol.make_client_capabilities()` boilerplate.

- **Narrow `filetypes` if the LSP covers languages with dedicated alternatives.** E.g. `sourcekit` ships listing `{swift, objc, objcpp, c, cpp}`, but `clangd` is the dedicated C/C++ LSP — narrow to just the language(s) the user asked for, otherwise two LSPs will fight over the same buffer later. Confirm with the user if uncertain.

- Keep `cmd`, `root_markers`, `settings`, `init_options` as-is.

- Drop verbose top-of-file comments from lspconfig.

If the user works in monorepos and the lifted config uses a simple `root_markers` list, offer to mirror the custom `root_dir` pattern from `lsp/vtsls.lua` (prioritises lockfiles, falls back to `.git`, then cwd).

### 6. Add to the enable list

Append the server name to the `vim.lsp.enable({ ... })` call in `lua/config/lsp_bootstrap.lua`. Preserve the existing quote/comma style.

### 7. Check & install the LSP binary

```bash
command -v <binary>
```

If missing, propose the install. **Confirm with the user before running** — do not install silently. Pick the most natural ecosystem:
- `brew install <pkg>` for native binaries (gopls, clangd, lua-language-server, etc.)
- `npm install -g <pkg>` for Node-based servers (vtsls, pyright, bashls, vscode-langservers-extracted)
- `go install`, `cargo install`, `pipx install`, `rustup component add` for language-native installers

### 8. Formatter

Use the research from step 2 to make a confident recommendation. Tell the user "the modern recommendation for <lang> is <X>" and confirm — don't put the burden of knowing on them. If research was inconclusive, fall back to this table:

| Language    | Formatter             | Notes                                                   |
|-------------|-----------------------|---------------------------------------------------------|
| Lua         | stylua                |                                                         |
| JS/TS/etc   | prettierd, eslint_d   | Match existing entries in conform.lua                   |
| Python      | ruff (or black)       | Ruff doubles as LSP                                     |
| Go          | LSP-native            | Skip conform unless asked                               |
| Rust        | LSP-native            | Skip conform unless asked                               |
| C/C++       | clang-format          |                                                         |
| Bash        | shfmt                 |                                                         |
| Nix         | nixfmt                |                                                         |
| JSON/YAML/MD| prettierd             | Use `stop_after_first = true` like existing entries     |

If a formatter is chosen:
- Check the binary on PATH; confirm install if missing (same rules as step 7).
- **Look up the conform formatter id — it is NOT always the binary name.** Conform uses its own naming. Examples: binary `swift-format` → conform id `swift_format`; binary `clang-format` → conform id `clang_format`. List `~/.local/share/nvim/site/pack/core/opt/conform.nvim/lua/conform/formatters/ | grep -i <lang>` and pick the matching `.lua` (file basename = conform id). If multiple match (e.g. `swift.lua`, `swift_format.lua`, `swiftformat.lua`), `Read` each briefly to pick the one whose `command` field matches the binary the user actually has installed.
- Add to `formatters_by_ft` in `~/.dotfiles/.config/nvim/plugin/conform.lua` using the conform id (not the binary name). Preserve column alignment and quoting style.

### 9. Verify

Run a **headless** check that confirms both the LSP attaches AND the formatter resolves to an available binary, in one shot:

```bash
mkdir -p /tmp/lang-test && cat > /tmp/lang-test/sample.<ext> <<'EOF'
<minimal valid file for the language>
EOF
nvim --headless \
  +'edit /tmp/lang-test/sample.<ext>' \
  +'sleep 2' \
  +'lua local c = require("conform"); io.write("clients: " .. table.concat(vim.tbl_map(function(c) return c.name end, vim.lsp.get_clients()), ",") .. "\n"); io.write("formatters: " .. table.concat(vim.tbl_map(function(f) return f.name .. "(avail=" .. tostring(f.available) .. ")" end, c.list_formatters(0)), ",") .. "\n")' \
  +'qa!' 2>&1
rm -rf /tmp/lang-test
```

Expected output:
- `clients: <server>` — LSP attached. If empty: check `command -v <binary>`, re-read `lsp/<server>.lua` for leftover `require 'lspconfig...'` lines, check that the filetype was detected.
- `formatters: <id>(avail=true)` — formatter resolves AND its binary is on PATH. If `formatters:` is empty, the conform id is wrong (you likely used the binary name — see step 8). If `avail=false`, the binary isn't on PATH (step 7).

Do **not** rely on `:lua require("conform").format()` alone as the check — it silently succeeds when no formatters apply to the buffer, hiding ID mismatches.

If you cannot run headless (no PATH to nvim from the agent shell), tell the user the exact command to run.

### 10. Report

Summarise:
- Files changed (`.config/nvim/lsp/<server>.lua`, `lua/config/lsp_bootstrap.lua`, optionally `plugin/conform.lua`).
- Binaries installed or proposed.
- Anything skipped or punted.

Do **not** commit. The user prefers explicit commit requests in their style ("nvim - <subject>").

## Out of scope

- Mason / mason-lspconfig / mason-tool-installer / nvim-lspconfig (the plugin). The whole point of this skill is to avoid those.
- Treesitter parsers (`nvim-pack-lock.json` doesn't manage them).
- Linter plugins (`nvim-lint`, etc.) — rely on LSP diagnostics. If the user explicitly wants a separate linter, surface the plugin choice and wait.
- DAP / debug adapters.
- Copilot / AI completion LSPs.

If the user's request implies any of these, name the option and ask before pulling in a plugin.
