# Background Tool Calls

This document explains the background tool call system that allows running commands and subagents in separate tmux windows without losing focus.

## Overview

Background tool calls are commands that run in separate tmux windows while your main pi session continues. They are ideal for:

- Long-running searches or computations
- Delegating tasks to subagents
- Running arbitrary CLI commands in the background
- Keeping your main session responsive

## Architecture

### Core Components

1. **tool-runner.ts** - Core abstraction for spawning and monitoring background calls
2. **tmux-subagents** - Extension that exposes tools for spawning subagents and commands
3. **render.ts** - Shared UI rendering for collapsed/expanded tool call views

### File Structure

```
/tmp/pi-tool-calls/<toolCallId>/
├── run.sh        # Spawn script
├── live.log      # Streamed stdout+stderr (for live progress)
├── result.done   # FINAL output (published atomically on completion)
├── meta.json     # { id, kind, name, command, cwd, startedAt }
└── task.txt      # (subagents only) the task prompt
```

### Completion Model

- **Completion** is determined solely by the existence of `result.done`
- **Final output** is always read from `result.done`
- `live.log` and tmux `capture-pane` are used **only** for live progress

## Usage

### Spawning a Subagent

```typescript
const result = await spawn_subagent({
  task: "Analyze the codebase for authentication patterns",
  name: "auth-analysis",
  interactive: true  // default: true, set false for headless
});
// Returns immediately with toolCallId
```

### Running a Command

```typescript
const result = await run_command({
  command: "rg -n TODO src/ | head -50",
  name: "todo-scan"
});
// Returns immediately with toolCallId
```

### Retrieving Results

**Block until complete:**
```typescript
const output = await wait_tool_call({
  toolCallId: "<id>",
  timeout: 300  // seconds, default
});
```

**Check progress:**
```typescript
const status = await check_tool_call({
  toolCallId: "<id>"
});
// Returns live progress if running, final output if done
```

### Listening for Completion

The parent agent is automatically woken up when a spawned tool call completes. You don't need to poll.

## Extensions Using This System

### Web Search (Kagi)

Web searches run as background tool calls:

```typescript
const result = await web_search({
  query: "latest TypeScript features 2026",
  limit: 15,
  timerange: "month"
});
// Returns immediately with toolCallId
// Use wait_tool_call to get results
```

### Caffeinate Keep Awake

Keeps your Mac awake while the agent is working:

- Starts `caffeinate -w $$` on `agent_start`
- Stops on `agent_end` or `session_shutdown`
- Shows "Mac awake" in status bar while active

### SSH Remote Execution

Delegates file operations to a remote machine via SSH:

```bash
pi -e ./ssh.ts --ssh user@host:/remote/path
```

Requires SSH key-based authentication.

### LM Studio Provider

Auto-detects and registers models from local LM Studio server:

1. Start LM Studio server
2. Extension queries `http://127.0.0.1:1234/api/v0/models`
3. All non-embedding models are registered automatically

## Skills

### Wrap-up Skill

Turns a session into a single return value. Use when finishing a spawned subagent:

```typescript
// The subagent writes to $PI_WRAPUP_FILE
// This becomes the tool call result
write({
  path: process.env.PI_WRAPUP_FILE,
  content: "# Summary\n\n..."
});
```

### Notetaking Skill

Create, list, search, and manage notes in `~/Notes`:

- Notes are individual Markdown files
- Filename format: `YYYY-MM-DD-topic.md`
- First line: `# Title`
- Optional: `tags: tag1, tag2`

## Troubleshooting

**"requires running inside tmux"** - Tool calls need tmux. Start tmux first, then run pi.

**KAGI_API_KEY not set** - Add to `~/.pi/agent/.env`:
```
KAGI_API_KEY=your_api_key_here
```

**Windows not closing** - Windows auto-close after 5 seconds. Adjust `closeDelaySeconds` in spawn options.