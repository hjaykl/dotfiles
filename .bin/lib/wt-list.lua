-- The repos open in Rex, by worktree, and which sessions are in each.
-- Run with `rex do ~/.bin/lib/wt-list.lua --json` (wt-ui, wt sessions).
--
-- A repo counts as open when some pane in some session is in one of its
-- checkouts (the pane's foreground process cwd). A session named
-- "<repo>/<branch>" (as `wt` names them) belongs to that worktree, wherever
-- its shells have since gone. Any other session belongs to the worktree that
-- most closely contains one of its panes, so sessions made by hand match too.
--
-- Each session also carries the agents in it: panes whose programs report a
-- status (OSC 7501; Claude Code does), most urgent first, and that state as
-- the session's `state` (blocked > error > done > working > idle).
--
-- `skip=<block id>` leaves that pane out (the popup asking). `all=true` also
-- lists the repos in the folders named in ~/.config/wt/roots (one folder or
-- shell glob per line, such as ~/Dev/*; # starts a comment), open or not.
--
-- Result: { repos = [ { name, main, common, worktrees = [
--   { path, branch, main, sessions = [ { id, label, state?, agents = [
--     { state, kind?, msg?, app?, title?, tab, name?, block_id } ] } ] } ] } ] }
-- Repos are sorted by name; the main checkout comes first, then by branch.

---@diagnostic disable: undefined-global

local TERMINAL = "com.superlogical.terminal"

local function lines(text)
  local out = {}
  for line in (text or ""):gmatch("[^\n]+") do out[#out + 1] = line end
  return out
end

-- path is `dir` or inside it.
local function within(path, dir)
  return path == dir or path:sub(1, #dir + 1) == dir .. "/"
end

-- Most urgent first; unknown states count as idle (as the protocol says).
local URGENCY = { blocked = 5, error = 4, done = 3, working = 2, idle = 1 }
local function urgency(state) return URGENCY[state] or 1 end

-- The most urgent status record a pane's programs report, if any.
local function pane_status(session_id, block_id)
  local st = rex.block.call(TERMINAL, "program_status", { session_id = session_id, block_id = block_id })
  local best
  for _, r in ipairs(st and st.records or {}) do
    if not best or urgency(r.state) > urgency(best.state) then best = r end
  end
  return best
end

-- A name the agent gave itself: its terminal title, when the program that set
-- it is the one reporting status (Claude Code titles itself after the
-- conversation). Not its generic name, and without a leading spinner.
local GENERIC = { ["claude code"] = true, ["claude"] = true }
local function pane_name(session_id, block_id, status)
  local t = rex.block.call(TERMINAL, "title", { session_id = session_id, block_id = block_id })
  local title = t and t.title or ""
  if title == "" then return nil end
  local owner, by = status.owner, t.owner
  if owner and by and owner.pid ~= by.pid then return nil end
  title = title:gsub("^[^%w]+", ""):gsub("%s+$", "")
  if title == "" or GENERIC[title:lower()] then return nil end
  return title
end

-- 1. Every session's pane folders, and its agents.
local sessions = {}
local list = rex.call("session.list", {})
for _, s in ipairs(list and list.sessions or {}) do
  rex.call("session.attach", { session_id = s.session_id })
  local tabs, tab_list = {}, {}
  local view = rex.call("session.view", { session_id = s.session_id })
  for i, w in ipairs(view and view.windows or {}) do
    -- Rex's default names ("Window 1a2b3c4d") say nothing: use the number.
    local named = w.label and w.label ~= "" and not w.label:match("^Window %x+$")
    tabs[w.window_id] = named and w.label or ("tab " .. i)
    tab_list[#tab_list + 1] = { name = tabs[w.window_id], active = w.window_id == view.active_window_id }
  end
  local blocks = rex.call("session.list_blocks", { session_id = s.session_id })
  local cwds, seen, agents = {}, {}, {}
  for _, b in ipairs(blocks and blocks.blocks or {}) do
    if b.block_id == (rex.args and rex.args.skip) then goto continue end
    local p = rex.block.call(TERMINAL, "process", { session_id = s.session_id, block_id = b.block_id })
    local cwd = p and p.foreground and p.foreground.cwd
    if cwd and cwd ~= "" and not seen[cwd] then
      seen[cwd] = true
      cwds[#cwds + 1] = cwd
    end
    local r = pane_status(s.session_id, b.block_id)
    if r then
      agents[#agents + 1] = {
        state = URGENCY[r.state] and r.state or "idle",
        kind = r.kind, msg = r.msg, title = r.title,
        app = r.effective_app or r.app,
        tab = tabs[b.window_id] or b.label or "",
        name = pane_name(s.session_id, b.block_id, r),
        block_id = b.block_id,
      }
    end
    ::continue::
  end
  table.sort(agents, function(a, b) return urgency(a.state) > urgency(b.state) end)
  sessions[#sessions + 1] = {
    id = s.session_id, label = s.label or "", cwds = cwds,
    agents = agents, state = agents[1] and agents[1].state, tabs = tab_list,
  }
end

local function session_entry(s)
  return { id = s.id, label = s.label, state = s.state, agents = s.agents, tabs = s.tabs }
end

-- The folders from ~/.config/wt/roots that are git checkouts.
local function root_folders()
  local f = io.open((os.getenv("HOME") or "") .. "/.config/wt/roots")
  if not f then return {} end
  local globs = {}
  for line in f:lines() do
    line = line:gsub("#.*$", ""):gsub("^%s+", ""):gsub("%s+$", "")
    if line ~= "" then
      -- ~ is expanded by the shell only unquoted at the start.
      globs[#globs + 1] = line:gsub("^~/", '"$HOME"/')
    end
  end
  f:close()
  if #globs == 0 then return {} end
  local r = rex.exec({ "/bin/sh", "-c",
    'for d in ' .. table.concat(globs, " ") .. '; do [ -e "$d/.git" ] && echo "${d%/}"; done' },
    { timeout = 10 })
  return r and r.ok and lines(r.stdout) or {}
end

-- Git's own files are read directly rather than running git: the list is
-- rebuilt every 2 s while the popup is open, and a git process per repo was
-- most of its cost. These are the files `git worktree list` reads.
local function first_line(path)
  local f = io.open(path)
  if not f then return nil end
  local line = f:read("*l")
  f:close()
  return line
end

-- PATH with "." and ".." segments resolved.
local function normalize(path)
  local parts = {}
  for part in path:gmatch("[^/]+") do
    if part == ".." then parts[#parts] = nil
    elseif part ~= "." then parts[#parts + 1] = part end
  end
  return "/" .. table.concat(parts, "/")
end

local function parent(path) return path:match("^(.*)/[^/]*$") or "" end

-- The git common dir of the checkout DIR is in, or nil: the nearest .git up
-- from DIR, a folder (main checkout) or a file pointing at the repo's
-- worktrees/<name> folder (linked worktree).
local repo_of = {}
local function common_dir(dir)
  if repo_of[dir] ~= nil then return repo_of[dir] or nil end
  local d, common = dir, false
  while d ~= "" do
    if first_line(d .. "/.git/HEAD") then
      common = d .. "/.git"
      break
    end
    local link = first_line(d .. "/.git")
    local gitdir = link and link:match("^gitdir: (.+)$")
    if gitdir then
      if gitdir:sub(1, 1) ~= "/" then gitdir = d .. "/" .. gitdir end
      local cd = first_line(gitdir .. "/commondir")
      if cd then
        common = normalize(cd:sub(1, 1) == "/" and cd or gitdir .. "/" .. cd)
      else
        common = normalize(gitdir)
      end
      break
    end
    d = parent(d)
  end
  repo_of[dir] = common
  return common or nil
end

local function branch_of(head_file)
  local head = first_line(head_file) or ""
  return head:match("^ref: refs/heads/(.+)$") or ""
end

-- The folders from ~/.config/wt/roots that are git checkouts.
local function root_folders()
  local f = io.open((os.getenv("HOME") or "") .. "/.config/wt/roots")
  if not f then return {} end
  local globs = {}
  for line in f:lines() do
    line = line:gsub("#.*$", ""):gsub("^%s+", ""):gsub("%s+$", "")
    if line ~= "" then
      -- ~ is expanded by the shell only unquoted at the start.
      globs[#globs + 1] = line:gsub("^~/", '"$HOME"/')
    end
  end
  f:close()
  if #globs == 0 then return {} end
  local r = rex.exec({ "/bin/sh", "-c",
    'for d in ' .. table.concat(globs, " ") .. '; do [ -e "$d/.git" ] && echo "${d%/}"; done' },
    { timeout = 10 })
  return r and r.ok and lines(r.stdout) or {}
end

-- 2. Which repo each folder is in (by git's common dir): the sessions'
-- folders, and with all=true the configured ones.
local folders = {}
for _, s in ipairs(sessions) do
  for _, cwd in ipairs(s.cwds) do folders[#folders + 1] = cwd end
end
if rex.args and rex.args.all then
  for _, d in ipairs(root_folders()) do folders[#folders + 1] = d end
end
local repos, repo_list = {}, {}
for _, dir in ipairs(folders) do
  local common = common_dir(dir)
  if common and not repos[common] then
    repos[common] = { common = common, worktrees = {} }
    repo_list[#repo_list + 1] = repos[common]
  end
end

-- 3. Each repo's worktrees: the main checkout (the common dir's parent, when
-- it is a .git folder), then one per <common>/worktrees/<name>, whose gitdir
-- file names the checkout. Listing those folders is the one command run.
local names = {}
if #repo_list > 0 then
  local argv = { "/bin/sh", "-c", 'for c; do echo "== $c"; ls -1 "$c/worktrees" 2>/dev/null; done', "sh" }
  for _, repo in ipairs(repo_list) do argv[#argv + 1] = repo.common end
  local r = rex.exec(argv, { timeout = 10 })
  local current
  for _, line in ipairs(lines(r and r.stdout)) do
    local c = line:match("^== (.+)$")
    if c then
      current = c
      names[c] = {}
    elseif current then
      table.insert(names[current], line)
    end
  end
end

local all = {}
for _, repo in ipairs(repo_list) do
  local main_path = repo.common:match("^(.*)/%.git$")
  if main_path then
    local wt = { path = main_path, branch = branch_of(repo.common .. "/HEAD"), main = true, sessions = {} }
    repo.worktrees[#repo.worktrees + 1] = wt
    all[#all + 1] = wt
  end
  for _, name in ipairs(names[repo.common] or {}) do
    local admin = repo.common .. "/worktrees/" .. name
    local gitfile = first_line(admin .. "/gitdir")
    local path = gitfile and gitfile:match("^(.*)/%.git$")
    -- A checkout whose folder is gone (prunable) is left out.
    if path and first_line(path .. "/.git") then
      local wt = { path = path, branch = branch_of(admin .. "/HEAD"), main = false, sessions = {} }
      repo.worktrees[#repo.worktrees + 1] = wt
      all[#all + 1] = wt
    end
  end
  repo.main = main_path or repo.common
  repo.name = repo.main:match("([^/]+)$") or repo.main
end

-- 4. Sessions to worktrees: by `wt`'s name for it, else the closest
-- containing worktree of any pane.
local by_label = {}
for _, repo in ipairs(repo_list) do
  for _, wt in ipairs(repo.worktrees) do
    local leaf = wt.branch ~= "" and wt.branch or wt.path:match("([^/]+)$")
    by_label[repo.name .. "/" .. leaf] = wt
  end
end
for _, s in ipairs(sessions) do
  local hit = {}
  local named = by_label[s.label]
  if named then
    named.sessions[#named.sessions + 1] = session_entry(s)
  end
  for _, cwd in ipairs(named and {} or s.cwds) do
    local best
    for _, wt in ipairs(all) do
      if within(cwd, wt.path) and (not best or #wt.path > #best.path) then best = wt end
    end
    if best and not hit[best] then
      hit[best] = true
      best.sessions[#best.sessions + 1] = session_entry(s)
    end
  end
end

-- 5. Order, and drop bare entries.
local result = {}
for _, repo in ipairs(repo_list) do
  local wts = {}
  for _, wt in ipairs(repo.worktrees) do
    if not wt.bare then wts[#wts + 1] = wt end
  end
  table.sort(wts, function(a, b)
    if a.main ~= b.main then return a.main end
    return a.branch < b.branch
  end)
  result[#result + 1] = { name = repo.name, main = repo.main, common = repo.common, worktrees = wts }
end
table.sort(result, function(a, b) return a.name:lower() < b.name:lower() end)

return { repos = result }
