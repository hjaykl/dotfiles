# tmux-subagents

Run background **tool calls** in separate tmux tabs. A thin extension layer over the shared [`../lib/tool-runner.ts`](../lib/tool-runner.ts) abstraction.

A "tool call" is any command run in a new background tmux window (same tmux session, focus never switched). Two flavours:

- A **pi subagent** (`spawn_subagent`) — runs `pi --mode print` or an interactive TUI session
- An arbitrary **CLI command** (`run_command`)

Both are monitored the same way and share one model.

## Requirements

- Running inside tmux (`TMUX` must be set)
- `tmux` on PATH

## Tools

| Tool | Purpose |
|------|---------|
| `spawn_subagent` | Run a pi subagent in a background tmux tab |
| `run_command` | Run an arbitrary CLI command in a background tmux tab |
| `check_tool_call` | Peek at status; final output from `.done`, else live tmux progress |
| `wait_tool_call` | Block until done, return final output from `.done` |

`/tool-calls` lists active tool-call windows.

### spawn_subagent

```typescript
spawn_subagent({
  task: "Analyze authentication patterns in this codebase",
  name: "auth-scout",           // Optional: tmux window name
  interactive: true             // Optional: default true, runs TUI
})
→ returns immediately with a toolCallId
```

**Interactive mode** (default):
- Runs a full TUI pi session you can watch/steer
- Switch to it: `tmux select-window -t subagent-<id>`
- You can interrupt and reprompt
- Auto-shuts down after writing wrap-up summary

**Headless mode** (`interactive: false`):
- Runs `pi --mode print`
- Exits automatically when done
- No TUI rendering

### run_command

```typescript
run_command({
  command: "rg -n TODO src/ | head -50",
  name: "todo-scan"             // Optional: tmux window name
})
→ returns immediately with a toolCallId
```

### Retrieve results

```typescript
// Block until complete
wait_tool_call({
  toolCallId: "<id>",
  timeout: 300                  // Optional: seconds, default 300
})

// Peek at progress
check_tool_call({
  toolCallId: "<id>"
})
```

## Model (how it works)

Each tool call gets a **deterministic directory keyed by its toolCallId**:

```
/tmp/pi-tool-calls/<id>/
├── run.sh        # The spawn script
├── live.log      # Streamed stdout+stderr (for tmux/live progress)
├── result.done   # FINAL output, published atomically on completion
├── meta.json     # { id, kind, name, command, cwd, startedAt }
└── task.txt      # (subagents only) the task prompt
```

### Source of truth

- **Completion** is determined solely by the existence of `result.done`
- **Final output** is always read from `result.done` (raw CLI output, or subagent's summary)
- tmux `capture-pane` / `live.log` are used **only** for live progress

Because the directory is keyed by id, `check_tool_call` / `wait_tool_call` work reliably for any tool call — including ones spawned by other extensions (e.g. `web_search`) — with no in-memory tracking and even across pi restarts.

## Subagent Wrap-up

When spawning a subagent, the task prompt includes a directive to write a wrap-up summary to `$PI_WRAPUP_FILE`. This summary becomes the tool call result.

**Why wrap-up?**
- Clean return value instead of raw transcript
- Enables nesting: parent receives summary, not logs
- Subagent decides when it's genuinely done

**Wrap-up guidelines:**
- Be concise and self-contained
- Include outcome, key findings, files changed, blockers, follow-ups
- Write it only when the task is actually complete
- Don't try to "type /quit" — the extension handles shutdown

## Focus Mode

When a subagent is spawned, it runs in "focus mode":
- Your current window remains focused
- The subagent window is created in the background
- You're notified when it completes
- You can manually switch to it anytime: `tmux select-window -t <name>`

## Completion Subscriptions

When you spawn a tool call, the parent agent automatically subscribes to its completion. When the call finishes:
1. `result.done` is published
2. Parent is woken up with the result
3. You can continue working immediately

No polling required.

## Examples

### Delegate a Code Review

```typescript
const result = await spawn_subagent({
  task: "Review this PR for security vulnerabilities. Check for:\n" +
        "- SQL injection\n" +
        "- XSS vulnerabilities\n" +
        "- Authentication bypasses\n\n" +
        "Write your findings to the wrap-up file when done.",
  name: "security-review"
});

// Continue with other work...
// You'll be notified when complete
```

### Run a Background Command

```typescript
const result = await run_command({
  command: "find . -name '*.ts' -type f | wc -l",
  name: "file-count"
});

const output = await wait_tool_call({ toolCallId: result });
```

### Chain Tool Calls

```typescript
// Spawn multiple subagents in parallel
const search = await spawn_subagent({
  task: "Research React 19 features",
  name: "react-research"
});

const analyze = await spawn_subagent({
  task: "Analyze our codebase for React usage patterns",
  name: "react-analysis"
});

// Wait for both
const [searchResults, analysisResults] = await Promise.all([
  wait_tool_call({ toolCallId: search }),
  wait_tool_call({ toolCallId: analyze })
]);
```

## Notes

- Tool calls always run in the background; focus is never switched
- To watch one live, switch to its window manually in tmux
- Windows auto-close ~5 seconds after the command completes
- Timed-out waits return partial progress from the live log if available
- Use `/tool-calls` to list active tool-call windows

## Troubleshooting

**"requires running inside tmux"**
- Start tmux first: `tmux`
- Then run pi inside the tmux session

**Subagent not shutting down**
- The subagent must write to `$PI_WRAPUP_FILE`
- Once written, the extension auto-shuts it down
- Don't try to type `/quit` — it won't submit

**Results not appearing**
- Check the `.done` file directly: `/tmp/pi-tool-calls/<id>/result.done`
- Check `live.log` for errors: `/tmp/pi-tool-calls/<id>/live.log`

## Related

- [BACKGROUND_TOOL_CALLS.md](../BACKGROUND_TOOL_CALLS.md) - Full architecture documentation
- [lib/tool-runner.ts](../lib/tool-runner.ts) - Core implementation