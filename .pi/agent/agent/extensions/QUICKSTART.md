# Pi Coding Agent - Quick Start Guide

## Prerequisites

- macOS with Homebrew
- tmux (required for background tool calls)
- Node.js 20+

## Installation

```bash
# Clone and install
git clone <repo> ~/.dotfiles
cd ~/.dotfiles
./install.sh
```

## First Steps

### 1. Configure API Keys

Create `~/.pi/agent/.env`:

```bash
# Kagi Search (optional but recommended)
KAGI_API_KEY=your_kagi_api_key_here

# Add other API keys as needed
```

Get a Kagi key from: https://kagi.com/api/keys

### 2. Start a Session

```bash
# Start tmux
tmux

# Run pi
pi
```

### 3. Try a Web Search

```
Use web_search to find current information:
web_search(query="latest TypeScript features 2026")
```

The search runs in a background tmux window. You'll be notified when it completes.

### 4. Spawn a Subagent

```
Spawn a subagent for complex tasks:
spawn_subagent(task="Analyze this codebase for security vulnerabilities")
```

The subagent runs interactively in a separate tmux window. You can:
- Switch to it: `tmux select-window -t subagent-<id>`
- Interrupt and reprompt
- Wait for completion: `wait_tool_call(toolCallId="<id>")`

## Core Commands

| Command | Purpose |
|---------|---------|
| `web_search` | Search the web via Kagi API |
| `spawn_subagent` | Run a pi subagent in background |
| `run_command` | Run arbitrary CLI in background |
| `check_tool_call` | Peek at status/progress |
| `wait_tool_call` | Block until complete |
| `/tool-calls` | List active tool-call windows |
| `/reload` | Hot-reload extensions |

## Keybindings

- `ctrl-o` (in tool view): Expand/collapse tool call details
- `ctrl-a` then `n`: New tmux window
- `ctrl-a` then `w`: List windows

## Extensions Overview

### Background Tool Calls
Run commands and subagents without losing focus. See `BACKGROUND_TOOL_CALLS.md`.

### Web Search (Kagi)
Search the web with formatted results. See `WEB_SEARCH_KAGI_README.md`.

### Caffeinate Keep Awake
Keeps Mac awake during agent sessions. Auto-starts/stops.

### LM Studio Provider
Use local LLMs via LM Studio. Auto-detects available models.

### SSH Remote Execution
Delegate file operations to remote machines. See `ssh.ts`.

## Skills

### Notetaking
Create and manage notes in `~/Notes`.

```
Create note: write to ~/Notes/2026-06-27-topic.md
List notes: ls ~/Notes/
Search: grep -r "query" ~/Notes/
```

### Wrap-up
Summarize sessions into clean return values for subagents.

## Tips

1. **Use background calls** for anything that might take more than a few seconds
2. **Spawn subagents** for delegated work - they stay interactive
3. **Write wrap-ups** when finishing subagent tasks
4. **Use `/tool-calls`** to see what's running
5. **Check `live.log`** files for debugging tool calls

## Troubleshooting

**"requires running inside tmux"**
- Start tmux first: `tmux`
- Then run pi inside the tmux session

**Kagi search fails**
- Check `KAGI_API_KEY` is set in `~/.pi/agent/.env`
- Verify API key is valid at https://kagi.com/api/keys

**LM Studio not detected**
- Start the LM Studio server (Developer tab → Start Server)
- Default URL: `http://127.0.0.1:1234`