-- Rex configuration ported from ~/.tmux.conf and ~/.config/herdr/config.toml.
-- Layout: Rex session = tmux session / Herdr workspace, Rex window = tmux window /
-- Herdr tab, Rex block = pane.

local terminal = "com.superlogical.terminal"
local shell = terminal .. ".shell"

-- Blocks created through session.new_window/new_layer/new_split do not get the
-- login-shell PATH that `rex run` gives a normal terminal. Put the user's tool
-- directories on PATH explicitly before running a workflow command.
local function shell_quote(value)
  return "'" .. value:gsub("'", "'\\''") .. "'"
end

local function path_command(argv)
  local parts = {}
  for _, arg in ipairs(argv) do
    parts[#parts + 1] = shell_quote(arg)
  end
  return {
    "/bin/sh",
    "-c",
    'export PATH="$HOME/.bin:$HOME/.local/bin:$HOME/.pi/agent/bin:$PATH"; exec '
      .. table.concat(parts, " "),
  }
end

-- The current terminal's cwd, used to open popups where the key was pressed.
-- `process` is more reliable than `pwd` because it does not depend on shell
-- integration.
local function focused_cwd(ctx)
  if not ctx.block_id then
    return nil
  end
  local process, err = rex.block.call(terminal, "process", { block_id = ctx.block_id })
  if err ~= nil or not process then
    return nil
  end
  local foreground = process.foreground
  return foreground and foreground.cwd or nil
end

-- Floating layers have no pane background of their own, so give popup
-- terminals an opaque elevated background instead of letting the text below
-- show through.
local popup_background = "#161b22"
local popup_foreground = "#e6edf3"

local function style_popup(block_id)
  if not block_id then
    return
  end
  rex.block.call(terminal, "set_theme", {
    block_id = block_id,
    background = popup_background,
    foreground = popup_foreground,
    cursor = "#2f81f7",
    scheme = "dark",
  })
end

-- A tmux display-popup / Herdr popup: a floating layer that runs one command
-- and disappears when that command exits.
local function popup(name, title, key, command, options)
  options = options or {}
  rex.action{
    name = name,
    title = title,
    category = "Workflow",
    run = function(ctx)
      -- A floating layer always gets the full window's PTY size, so use the
      -- full window here. fzf draws its own inset panel with --margin.
      local layer, err = rex.session.new_layer{
        bounds = options.bounds or { x = 0, y = 0, w = 1, h = 1 },
        focus = true,
        layout = rex.layout.block{
          flavor = shell,
          options = {
            command = path_command(command),
            cwd = focused_cwd(ctx),
          },
        },
      }
      if err ~= nil then
        error(err, 0)
      end
      local block_id = layer.block_ids and layer.block_ids[1]
      if options.opaque then
        style_popup(block_id)
      end
      return layer
    end,
  }
  rex.bind(key, name)
end

-- Focus a window by label, or create it running a command. This replaces
-- herdr-focus-or-run for keybindings, where REX_SESSION is not in the action's
-- own environment. "nvim" also matches labels such as "nvim-server" and
-- "Neovim".
local function label_matches(actual, wanted)
  actual = (actual or ""):lower()
  wanted = wanted:lower()
  if actual == wanted then
    return true
  end
  return wanted == "nvim" and actual:find("nvim", 1, true) ~= nil
end

local function process_matches(block_id, wanted)
  local process = rex.block.call(terminal, "process", { block_id = block_id })
  local foreground = process and process.foreground
  if not foreground then
    return false
  end
  for _, candidate in ipairs({ foreground.argv0, foreground.name, foreground.path }) do
    if type(candidate) == "string" then
      local base = candidate:match("([^/]+)$") or candidate
      if base:lower() == wanted:lower() then
        return true
      end
    end
  end
  return false
end

local function show_window(ctx, window_id)
  if ctx.client_id and window_id then
    rex.client.queue("session.select", {
      session_id = ctx.session_id,
      window_id = window_id,
    })
  end
end

local function focus_or_run(label, command)
  return function(ctx)
    local view, err = rex.session.view{}
    if err ~= nil then
      error(err, 0)
    end

    for _, window in ipairs(view.windows or {}) do
      if label_matches(window.label, label) then
        local _, focus_err = rex.session.focus_window{ window_id = window.window_id }
        if focus_err ~= nil then
          error(focus_err, 0)
        end
        show_window(ctx, window.window_id)
        return
      end
    end

    -- Labels are user-editable; fall back to the foreground process name so a
    -- renamed tab (or an auto-labeled "Window ...") still matches its agent.
    for _, window in ipairs(view.windows or {}) do
      for _, layer in ipairs(window.layers or {}) do
        for _, block in ipairs(layer.blocks or {}) do
          if block.block_id and process_matches(block.block_id, label) then
            local _, focus_err = rex.session.focus_block{ block_id = block.block_id }
            if focus_err ~= nil then
              error(focus_err, 0)
            end
            show_window(ctx, window.window_id)
            return
          end
        end
      end
    end

    local created, create_err = rex.session.new_window{
      window_label = label,
      layout = rex.layout.block{
        flavor = shell,
        options = { command = path_command(command) },
      },
    }
    if create_err ~= nil then
      error(create_err, 0)
    end
    show_window(ctx, created and created.window_id)
  end
end

-- ---------------------------------------------------------------------------
-- Popups (from Herdr config.toml / tmux.conf)
-- ---------------------------------------------------------------------------

popup("fzf_files", "fzf files -> nvim", "alt+f",
  { "rex-fzf-nvr" })

popup("fzf_buffers", "fzf buffers -> nvim", "alt+b",
  { "rex-fzf-buffers" })

popup("fzf_rg", "ripgrep -> nvim", "alt+s",
  { "rex-fzf-rg" })

-- Herdr's prefix+g tab picker, as an fzf popup.
popup("fzf_tabs", "Go to tab", "ctrl+b>g",
  { "rex-fzf-tabs" })

popup("scratch", "Scratch terminal", "alt+'",
  { os.getenv("SHELL") or "/bin/sh" }, { opaque = true })

-- Yazi is a pane in Herdr, not a popup. Use a split that closes when yazi exits.
rex.action{
  name = "yazi_pane",
  title = "Yazi",
  category = "Workflow",
  run = function(ctx)
    local _, err = rex.session.new_split{
      anchor_id = ctx.block_id,
      direction = "horizontal",
      side = "after",
      ratio = 0.5,
      focus = true,
      layout = rex.layout.block{
        flavor = shell,
        label = "yazi",
        options = {
          command = path_command({ "rex-yazi" }),
          cwd = focused_cwd(ctx),
        },
      },
    }
    if err ~= nil then
      error(err, 0)
    end
  end,
}
rex.bind("alt+e", "yazi_pane")

-- ---------------------------------------------------------------------------
-- Select-or-create tabs (tmux M-g/M-c/M-n, Herdr alt+g/c/n)
-- ---------------------------------------------------------------------------

rex.action{
  name = "nvim_tab",
  title = "Nvim tab",
  category = "Workflow",
  run = focus_or_run("nvim", { "nvim-server" }),
}
rex.action{
  name = "lazygit_tab",
  title = "Lazygit tab",
  category = "Workflow",
  run = focus_or_run("lazygit", { "lazygit" }),
}
rex.action{
  name = "claude_tab",
  title = "Claude tab",
  category = "Workflow",
  run = focus_or_run("claude", { "claude" }),
}
rex.action{
  name = "pi_tab",
  title = "Pi tab",
  category = "Workflow",
  run = focus_or_run("pi", { "pi" }),
}

rex.bind("alt+n", "nvim_tab")
rex.bind("alt+g", "lazygit_tab")
rex.bind("alt+c", "claude_tab")
rex.bind("alt+p", "pi_tab")

-- The Herdr layout-bootstrap plugin, as a command-palette action: create a
-- session with nvim and pi tabs, focus nvim, then show the new session.
rex.action{
  name = "new_dev_session",
  title = "New dev session (nvim + pi)",
  category = "Workflow",
  args = { label = "string?" },
  run = function(ctx, args)
    if not ctx.client_id then
      error("new_dev_session needs a connected Rex app", 0)
    end

    local label = args.label
    if label == "" then
      label = nil
    end

    local pi_command = { "pi" }
    if label then
      pi_command = { "pi", "--name", label }
    end

    local created, err = rex.call("session.create", {
      label = label,
      initial_windows = {
        {
          window_label = "nvim",
          layout = rex.layout.block{
            flavor = shell,
            options = { command = path_command({ "nvim-server" }) },
          },
        },
        {
          window_label = "pi",
          layout = rex.layout.block{
            flavor = shell,
            options = { command = path_command(pi_command) },
          },
        },
      },
    })
    if err ~= nil then
      error(err, 0)
    end

    local nvim_window = created.initial_windows[1].window_id
    rex.client.queue("session.select", {
      session_id = created.session_id,
      window_id = nvim_window,
    })
    return created
  end,
}

-- ---------------------------------------------------------------------------
-- Splits, focus, close, zoom
-- ---------------------------------------------------------------------------

rex.bind("alt+d", "pane.split.right")
rex.bind("alt+shift+d", "pane.split.down")
rex.bind("ctrl+b>v", "pane.split.right")
rex.bind("ctrl+b>-", "pane.split.down")

local focus_keys = {
  h = "pane.focus.left",
  j = "pane.focus.down",
  k = "pane.focus.up",
  l = "pane.focus.right",
}
for key, action in pairs(focus_keys) do
  rex.bind("alt+" .. key, action)
  rex.bind("ctrl+b>" .. key, action)
end

rex.bind("alt+w", "pane.close")
rex.bind("ctrl+b>x", "pane.close")
rex.bind("alt+enter", "pane.zoom")
rex.bind("ctrl+b>z", "pane.zoom")

-- ---------------------------------------------------------------------------
-- Resize (tmux prefix+H/J/K/L, Herdr alt+shift+h/j/k/l and prefix+r mode)
-- ---------------------------------------------------------------------------

local resize_directions = {
  h = "left",
  j = "down",
  k = "up",
  l = "right",
}

-- Custom actions so held keys repeat like tmux's `bind -r H/J/K/L`.
-- pane.resize is a client action; queue it from the action that owns the key.
local function resize_action(direction, amount)
  return function()
    rex.client.queue("pane.resize", { direction = direction, amount = amount })
  end
end

for _, direction in pairs(resize_directions) do
  rex.action{
    name = "resize_" .. direction,
    title = "Resize " .. direction,
    category = "Workflow",
    repeats = true,
    run = resize_action(direction, 5),
  }
  rex.action{
    name = "resize_" .. direction .. "_big",
    title = "Resize " .. direction .. " (big step)",
    category = "Workflow",
    repeats = true,
    run = resize_action(direction, 15),
  }
end

for key, direction in pairs(resize_directions) do
  rex.bind("alt+shift+" .. key, "resize_" .. direction)
  rex.bind("ctrl+b>shift+" .. key, "resize_" .. direction)
end

rex.mode("resize", { exclusive = true })
rex.bind("ctrl+b>r", "client.mode.enter", { name = "resize" })

for key, direction in pairs(resize_directions) do
  rex.bind("resize/" .. key, "resize_" .. direction)
  rex.bind("resize/shift+" .. key, "resize_" .. direction .. "_big")
end

for key, direction in pairs({
  left = "left",
  right = "right",
  up = "up",
  down = "down",
}) do
  rex.bind("resize/" .. key, "resize_" .. direction)
  rex.bind("resize/shift+" .. key, "resize_" .. direction .. "_big")
end

rex.bind("resize/enter", "client.mode.exit")
rex.bind("resize/escape", "client.mode.exit")

-- ---------------------------------------------------------------------------
-- Tabs (tmux windows / Herdr tabs)
-- ---------------------------------------------------------------------------

rex.bind("alt+t", "client.tab.new")
rex.bind("ctrl+b>c", "client.tab.new")

rex.bind("alt+,", "client.tab.previous")
rex.bind("alt+.", "client.tab.next")
rex.bind("ctrl+b>p", "client.tab.previous")
rex.bind("ctrl+b>n", "client.tab.next")

rex.bind("ctrl+b>shift+,", "client.tab.move.backward")
rex.bind("ctrl+b>shift+.", "client.tab.move.forward")

for index = 1, 9 do
  rex.bind("alt+" .. index, "client.tab.goto", { index = index })
  rex.bind("ctrl+b>" .. index, "client.tab.goto", { index = index })
end

-- ---------------------------------------------------------------------------
-- Sessions (Herdr workspaces / tmux sessions)
-- ---------------------------------------------------------------------------

rex.bind("alt+shift+,", "session.previous")
rex.bind("alt+shift+.", "session.next")
rex.bind("ctrl+b>s", "session.switch")
rex.bind("ctrl+b>w", "session.switch")
rex.bind("ctrl+b>shift+r", "client.config.reload")
