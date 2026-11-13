-- Rex configuration. Rex's default keys apply; this file only adds the
-- workflow keys. They run the scripts in ~/.bin, with one nvim per Rex
-- session (~/.bin/lib/nvim-session.sh).

local terminal = "com.superlogical.terminal"
local shell = terminal .. ".shell"

local function shell_quote(value)
  return "'" .. value:gsub("'", "'\\''") .. "'"
end

-- Blocks created from Lua do not get the login-shell PATH, so put the tool
-- directories on PATH before running the command. NVIM_POPUP makes the
-- scripts hold errors on screen and close the popup when they hand over to
-- nvim or Hunk.
local function popup_command(argv, env)
  local parts = {}
  for _, pair in ipairs(env or {}) do
    parts[#parts + 1] = shell_quote(pair)
  end
  for _, arg in ipairs(argv) do
    parts[#parts + 1] = shell_quote(arg)
  end
  return {
    "/bin/sh",
    "-c",
    'export NVIM_POPUP=1 PATH="$HOME/.bin:$HOME/.local/bin:$HOME/.hunk/bin:/opt/homebrew/bin:$PATH"; exec /usr/bin/env '
      .. table.concat(parts, " "),
  }
end

-- The focused terminal's foreground process (cwd, name), so popups open where
-- the key was pressed. More reliable than `pwd`: no shell integration needed.
local function focused_process(ctx)
  if not ctx.block_id then
    return {}
  end
  local process, err = rex.block.call(terminal, "process", { block_id = ctx.block_id })
  if err ~= nil or not process or not process.foreground then
    return {}
  end
  return process.foreground
end

-- A popup: a floating layer over the window that runs one command and
-- disappears when it exits. `command` is an argv list, or a function of the
-- focused process that returns one; `env` is a list of "NAME=value".
--
-- Two Rex limitations shape this:
--   * A layer's terminal is as big as the whole window whatever the layer's
--     size, so a smaller layer cuts the program off. The layer therefore
--     covers the window, and a program that should look smaller draws its own
--     inset (see `picker` below).
--   * A layer's default background is drawn see-through. Only cells where
--     the program paints a background colour itself are solid.
--
-- Its key is a toggle: pressed while the popup is open, it closes it.

-- Close every open popup called `name`; true when there was one.
local function close_popups(name)
  local view = rex.session.view{}
  local closed = false
  for _, window in ipairs(view and view.windows or {}) do
    for _, layer in ipairs(window.layers or {}) do
      local block = layer.blocks and layer.blocks[1]
      if layer.kind == "floating" and block and block.label == name then
        rex.session.close_layer{ layer_id = layer.layer_id }
        closed = true
      end
    end
  end
  return closed
end

local function popup(name, title, key, command, env)
  rex.action{
    name = name,
    title = title,
    category = "Workflow",
    run = function(ctx)
      if close_popups(name) then
        return
      end
      local foreground = focused_process(ctx)
      local argv = command
      if type(command) == "function" then
        argv = command(foreground)
      end
      local layer, err = rex.session.new_layer{
        bounds = { x = 0, y = 0, w = 1, h = 1 },
        focus = true,
        layout = rex.layout.block{
          flavor = shell,
          label = name,
          options = {
            command = popup_command(argv, env),
            cwd = foreground.cwd,
          },
        },
      }
      if err ~= nil then
        error(err, 0)
      end
      return layer
    end,
  }
  rex.bind(key, name)
end

-- fzf pickers: fzf draws itself as a bordered panel inset from the window
-- edges and paints its own background, so it looks like a solid, smaller
-- popup. `margin` is fzf's --margin (vertical,horizontal).
local function picker(margin)
  return {
    "FZF_DEFAULT_OPTS=--margin " .. margin .. " --border rounded"
      .. " --color bg:#161b22,gutter:#161b22,preview-bg:#161b22,border:#484f58",
  }
end

popup("pick_files", "Files -> nvim", "cmd+o", { "nvim-pick-files" }, picker("15%,10%"))
popup("pick_buffers", "Buffers -> nvim", "cmd+b", { "nvim-pick-buffers" }, picker("15%,10%"))
popup("grep", "Grep -> nvim", "cmd+s", { "nvim-grep" }, picker("7%,5%"))

-- Sidebars: one block per session, shown as a split beside the focused
-- block, on the left. The key brings it to the tab you are in, or hides it if it is
-- already there. Hiding detaches the block, so the program keeps running and
-- comes back as you left it; quitting the program ends it, and the next press
-- starts a new one in the focused block's directory.
--
-- They open at half the width: the Rex app resets every new split to half
-- whatever ratio it is created with, so asking for less only makes it jump.
-- Files opened from them go to the session's nvim and the sidebar stays.

local function find_block(label)
  local list = rex.session.list_blocks{}
  for _, block in ipairs(list and list.blocks or {}) do
    if block.label == label then
      return block
    end
  end
  return nil
end

local function window_of(block_id)
  local list = rex.session.list_blocks{}
  for _, block in ipairs(list and list.blocks or {}) do
    if block.block_id == block_id then
      return block.window_id
    end
  end
  return nil
end

-- Sidebars share the left of the tab: showing one hides any other sidebar in
-- this tab and takes its place.
local sidebars = {}

local function placed_sidebar_in(window_id, except)
  local list = rex.session.list_blocks{}
  for _, block in ipairs(list and list.blocks or {}) do
    if sidebars[block.label] and block.label ~= except
      and block.placement == "placed" and block.window_id == window_id then
      return block
    end
  end
  return nil
end

-- `command` is a function of the focused process that returns the argv.
local function sidebar(name, title, key, command)
  sidebars[name] = true
  rex.action{
    name = name,
    title = title,
    category = "Workflow",
    run = function(ctx)
      if not ctx.block_id then
        error(name .. ": no focused block", 0)
      end
      local window_id = window_of(ctx.block_id)
      local block = find_block(name)

      -- Already in this tab: hide it.
      if block and block.placement == "placed" and block.window_id == window_id then
        local _, err = rex.session.detach_block{ block_id = block.block_id }
        if err ~= nil then
          error(err, 0)
        end
        return
      end

      -- Another sidebar here: put this one beside it, then hide it, so this
      -- one ends up in its place.
      local other = placed_sidebar_in(window_id, name)
      local anchor = other and other.block_id or ctx.block_id

      if not block then
        local foreground = focused_process(ctx)
        local _, err = rex.session.new_split{
          anchor_id = anchor,
          direction = "horizontal",
          side = "before",
          ratio = 0.5,
          focus = true,
          layout = rex.layout.block{
            flavor = shell,
            label = name,
            options = {
              -- NVIM_POPUP empty: opening a file must not close the sidebar.
              command = popup_command(command(foreground), { "NVIM_POPUP=" }),
              cwd = foreground.cwd,
            },
          },
        }
        if err ~= nil then
          error(err, 0)
        end
        block = find_block(name)
      else
        -- Hidden, or in another tab: bring it here.
        local _, err = rex.session.move_block{
          block_id = block.block_id,
          anchor_block_id = anchor,
          direction = "horizontal",
          side = "before",
          ratio = 0.5,
        }
        if err ~= nil then
          error(err, 0)
        end
      end

      if other then
        rex.session.detach_block{ block_id = other.block_id }
      end
      if block then
        rex.session.focus_block{ block_id = block.block_id }
      end
    end,
  }
  rex.bind(key, name)
end

-- Started from the nvim block, Yazi opens on the file being
-- edited.
sidebar("yazi", "Yazi", "cmd+e", function(foreground)
  local from_nvim = (foreground.name or ""):lower() == "nvim"
  return { "nvim-yazi", foreground.cwd or "", from_nvim and "nvim" or "" }
end)

sidebar("lazygit", "Lazygit", "cmd+g", function()
  return { "lazygit" }
end)

-- Hunk: the review lives in its own "hunk" tab (the one `hunk-open` uses, so
-- reviews opened by agents or lazygit's `I` land in the same place).
-- cmd+shift+g toggles between that tab and the one you came from; with no
-- review open it starts one of the working tree, in watch mode so it follows
-- edits and staging.
local hunk_label = "hunk"
local hunk_return_window = nil

local function show_window(ctx, window_id)
  rex.session.focus_window{ window_id = window_id }
  if ctx.client_id then
    rex.client.queue("session.select", { session_id = ctx.session_id, window_id = window_id })
  end
end

local function find_window(label)
  local view = rex.session.view{}
  for _, window in ipairs(view and view.windows or {}) do
    if window.label == label then
      return window.window_id
    end
  end
  return nil
end

local function window_exists(window_id)
  local view = rex.session.view{}
  for _, window in ipairs(view and view.windows or {}) do
    if window.window_id == window_id then
      return true
    end
  end
  return false
end

rex.action{
  name = "hunk",
  title = "Hunk review",
  category = "Workflow",
  run = function(ctx)
    local here = ctx.block_id and window_of(ctx.block_id)
    local hunk = find_window(hunk_label)

    -- On the review: go back.
    if hunk and here == hunk then
      if hunk_return_window and window_exists(hunk_return_window) then
        show_window(ctx, hunk_return_window)
      else
        rex.session.focus_previous_window{}
      end
      return
    end

    hunk_return_window = here
    if hunk then
      show_window(ctx, hunk)
      return
    end

    local foreground = focused_process(ctx)
    local created, err = rex.session.new_window{
      window_label = hunk_label,
      layout = rex.layout.block{
        flavor = shell,
        label = hunk_label,
        options = {
          command = popup_command({ "hunk-open", "--run", "diff", "--watch" }, { "NVIM_POPUP=" }),
          cwd = foreground.cwd,
        },
      },
    }
    if err ~= nil then
      error(err, 0)
    end
    if created and created.window_id then
      show_window(ctx, created.window_id)
    end
  end,
}
rex.bind("cmd+shift+g", "hunk")

-- Hunk reviews: cmd+shift+h makes the agent in the focused block the one that
-- gets Hunk review notes in this session (toggle; ~/.bin/hunk-listen). Same as
-- /hunk-listen in the agent, without spending a turn on it. Reviews that could
-- not be delivered earlier are pasted into the agent.
rex.action{
  name = "hunk_listen",
  title = "Hunk: send reviews to this agent",
  category = "Workflow",
  run = function(ctx)
    if not ctx.block_id then
      error("hunk_listen: no focused block", 0)
    end
    local result = rex.exec{
      "/usr/bin/env",
      "REX_SESSION=" .. ctx.session_id,
      "REX_BLOCK=" .. ctx.block_id,
      "HUNK_LISTEN_DELIVER=1",
      "/bin/sh", "-c",
      'export PATH="$HOME/.bin:$HOME/.local/bin:/opt/homebrew/bin:$PATH"; exec hunk-listen',
    }
    if not result.ok then
      error(result.stderr ~= "" and result.stderr or "hunk-listen failed", 0)
    end
    return result.stdout
  end,
}
rex.bind("cmd+shift+h", "hunk_listen")
