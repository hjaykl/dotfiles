# Pi Extensions

This directory contains extensions and skills for the pi coding agent.

## Extensions

Extensions are TypeScript modules that register tools, commands, and event handlers with pi. They are auto-discovered and loaded from this directory.

### Core Extensions

| Extension | Description |
|-----------|-------------|
| `tmux-subagents` | Run background tool calls in separate tmux windows |
| `web-search-kagi` | Web search via Kagi API (runs as background tool) |
| `caffeinate-keep-awake` | Keeps Mac awake during agent sessions |
| `lmstudio` | LM Studio provider for local LLMs |
| `ssh` | SSH remote execution for file operations |

### Shared Libraries

| Module | Description |
|--------|-------------|
| `lib/tool-runner.ts` | Core abstraction for background tool calls |
| `lib/render.ts` | Shared UI rendering (collapsed/expanded views) |
| `lib/kagi-search.mjs` | Standalone Kagi search CLI |

## Skills

Skills are specialized tools with documentation that agents can reference.

| Skill | Description |
|-------|-------------|
| `notetaking/SKILL.md` | Create, list, search notes in `~/Notes` |
| `wrap-up/SKILL.md` | Summarize sessions into return values |

## Documentation

| Document | Purpose |
|----------|---------|
| `BACKGROUND_TOOL_CALLS.md` | Deep dive into the tool call system |
| `QUICKSTART.md` | Getting started guide |
| `WEB_SEARCH_KAGI_README.md` | Kagi search setup and usage |
| `WEB_SEARCH_QUICKSTART.md` | Quick start for web search |

## Extension API

Extensions receive an `ExtensionAPI` object with:

### Events

| Event | Description |
|-------|-------------|
| `session_start` | Fired when a pi session starts |
| `session_shutdown` | Fired when a session ends |
| `agent_start` | Fired when an agent begins work |
| `agent_end` | Fired when an agent finishes a turn |
| `before_agent_start` | Modify system prompt before agent starts |
| `user_bash` | Handle user `!` commands |

### Registration Methods

| Method | Purpose |
|--------|---------|
| `registerTool()` | Add a new tool (function the agent can call) |
| `registerCommand()` | Add a slash command (e.g., `/tool-calls`) |
| `registerFlag()` | Add a CLI flag (e.g., `--ssh`) |
| `registerProvider()` | Add a model provider |

### Example Extension

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("My extension loaded!", "info");
  });

  pi.registerTool({
    name: "hello_world",
    label: "Hello World",
    description: "Say hello",
    parameters: Type.Object({
      name: Type.String({ description: "Name to greet" })
    }),
    async execute(_id, params) {
      return {
        content: [{ type: "text", text: `Hello, ${params.name}!` }]
      };
    }
  });
}
```

## Hot Reload

Extensions support hot reload with `/reload`. After modifying an extension:

1. Save the file
2. Run `/reload` in pi
3. The extension is reloaded automatically

## Background Tool Call Model

All background tool calls (subagents, commands, web searches) share a common model:

1. **Spawning**: Create a new tmux window running the command
2. **Tracking**: Each call gets a unique ID and directory in `/tmp/pi-tool-calls/`
3. **Monitoring**: Watch for `result.done` file creation
4. **Completion**: Parent agent is notified automatically

See `BACKGROUND_TOOL_CALLS.md` for details.

## Best Practices

### Tool Design

- **Return structured output**: Use `{ content, details, isError }`
- **Provide good descriptions**: Help the agent understand when to use the tool
- **Handle errors gracefully**: Set `isError: true` with helpful messages
- **Use render functions**: Provide `renderCall` and `renderResult` for nice UI

### Subagent Design

- **Write wrap-ups**: Always write to `$PI_WRAPUP_FILE` when done
- **Be self-contained**: Wrap-ups should stand alone without context
- **Stay interactive**: Subagents can ask questions and wait for answers
- **Know when to stop**: Write wrap-up only when truly finished

### Testing Extensions

```bash
# Run pi with a specific extension
pi -e ./path/to/extension.ts

# Hot reload
/reload

# Check extension logs
# Look in tmux window or use /debug
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        pi Session                           │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                Extension Manager                     │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │    │
│  │  │ tmux-       │  │ web-search- │  │ caffeinate  │  │    │
│  │  │ subagents   │  │ kagi        │  │ keep-awake  │  │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │    │
│  └─────────────────────────────────────────────────────┘    │
│                              │                               │
│              ┌───────────────┼───────────────┐              │
│              ▼               ▼               ▼              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  tmux       │  │  Kagi API   │  │  caffeinate │         │
│  │  windows    │  │  (background│  │  (keep      │         │
│  │  (background│  │   process)  │  │   awake)    │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

## File Organization

```
extensions/
├── tmux-subagents/       # Background tool call extension
│   ├── index.ts          # Main extension code
│   └── README.md         # Documentation
├── lib/                  # Shared libraries
│   ├── tool-runner.ts    # Core tool call abstraction
│   ├── render.ts         # UI rendering helpers
│   └── kagi-search.mjs   # Standalone Kagi CLI
├── web-search-kagi.ts    # Web search tool
├── caffeinate-keep-awake.ts
├── lmstudio.ts
├── ssh.ts
├── BACKGROUND_TOOL_CALLS.md
├── QUICKSTART.md
├── WEB_SEARCH_KAGI_README.md
└── WEB_SEARCH_QUICKSTART.md

skills/
├── notetaking/
│   ├── SKILL.md
│   └── scripts/notes.sh
└── wrap-up/
    └── SKILL.md
```