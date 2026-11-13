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
-- `skip=<block id>` leaves that pane out (the popup asking).
--
-- Result: { repos = [ { name, main, common, worktrees = [
--   { path, branch, main, sessions = [ { id, label, state?, agents = [
--     { state, kind?, msg?, app?, title?, tab, name?, block_id } ] } ] } ] } ] }
-- Repos are sorted by name; the main checkout comes first, then by branch.

---@diagnostic disable: undefined-global

local TERMINAL = "com.superlogical.terminal"

local function git(args)
  local argv = { "git" }
  for _, a in ipairs(args) do argv[#argv + 1] = a end
  local r = rex.exec(argv, { timeout = 10 })
  if not r or not r.ok then return nil end
  return r.stdout
end

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
  local tabs = {}
  local view = rex.call("session.view", { session_id = s.session_id })
  for i, w in ipairs(view and view.windows or {}) do
    -- Rex's default names ("Window 1a2b3c4d") say nothing: use the number.
    local named = w.label and w.label ~= "" and not w.label:match("^Window %x+$")
    tabs[w.window_id] = named and w.label or ("tab " .. i)
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
    agents = agents, state = agents[1] and agents[1].state,
  }
end

local function session_entry(s)
  return { id = s.id, label = s.label, state = s.state, agents = s.agents }
end

-- 2. Which repo each folder is in (by git's common dir).
local repos, repo_list, checked = {}, {}, {}
for _, s in ipairs(sessions) do
  for _, cwd in ipairs(s.cwds) do
    if not checked[cwd] then
      checked[cwd] = true
      local out = lines(git({ "-C", cwd, "rev-parse", "--path-format=absolute", "--show-toplevel", "--git-common-dir" }))
      local common = out[2]
      if common and not repos[common] then
        repos[common] = { common = common, worktrees = {} }
        repo_list[#repo_list + 1] = repos[common]
      end
    end
  end
end

-- 3. Each repo's worktrees.
local all = {}
for _, repo in ipairs(repo_list) do
  local wt
  for _, line in ipairs(lines(git({ "--git-dir", repo.common, "worktree", "list", "--porcelain" }))) do
    local path = line:match("^worktree (.+)$")
    if path then
      wt = { path = path, branch = "", main = #repo.worktrees == 0, sessions = {} }
      repo.worktrees[#repo.worktrees + 1] = wt
      all[#all + 1] = wt
    elseif wt then
      local branch = line:match("^branch refs/heads/(.+)$")
      if branch then wt.branch = branch end
      if line == "bare" then wt.bare = true end
    end
  end
  local main = repo.worktrees[1]
  repo.main = main and main.path or repo.common:gsub("/%.git$", "")
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
