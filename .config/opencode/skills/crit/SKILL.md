---
name: crit
description: "Review code changes, a plan, a live page (running dev server), or a local HTML file with crit inline comments. Use when asked to review code, a plan, a diff, a running web app, or when you want structured human feedback on your work. Also covers programmatic comment authoring, crit share/unpublish, GitHub PR sync, and review file interpretation."
compatibility: opencode
---

## What I do

- Use `/crit-loop` as the primary OpenCode entrypoint for a plan file, the current git diff, a live page (URL to a running dev server or staging site), or a local HTML file.
- Read the active review file and current Crit comments when working inside an active lifecycle.
- Read the review file and address unresolved inline comments.
- Leave inline review comments programmatically with `crit comment`.
- Sync reviews with GitHub PRs via `crit pull` and `crit push`.

## When to use me

Use this when the user asks to review a plan, spec, code changes, a live page (running dev server, staging URL), or a local HTML file in Crit, when project instructions require a Crit pass before accepting non-trivial changes, when leaving inline comments on code, or when syncing reviews with GitHub PRs.

## Primary OpenCode flow

Use `/crit-loop` for the normal Crit lifecycle from OpenCode. The `crit-dispatcher` agent owns the blocking Crit command, delegates fixes to `crit-builder`, delegates follow-up review to `crit-reviewer`, and repeats rounds until approval or a blocker.

Supported examples:

```
/crit-loop                         # current git changes
/crit-loop plan --name demo plan.md # plan review
/crit-loop live http://localhost:3000
/crit-loop --pr 123
/crit-loop --range main..HEAD
```

Worker agents operating inside a dispatcher-owned lifecycle should use the active review context instead of creating a second lifecycle:

```bash
crit status --json
crit comments --json --all
```

Use the `review_file` path from `crit status --json` as the source of truth for comments and reviewed files. Headless commands such as `crit comment`, `crit comments`, `crit pull`, and `crit push` are allowed for workers because they update/read the active review without taking over the lifecycle.

## Command Selection

Use this opencode command for Crit lifecycle work:

1. `/crit-loop` — start the agent-owned Crit lifecycle and delegate build/review rounds until approval.

## OpenCode Crit agent configuration

The Crit workers are normal OpenCode Markdown agents in `agents/`. OpenCode supports per-agent default models in agent frontmatter:

```markdown
---
description: Addresses unresolved Crit comments.
mode: subagent
model: provider/model-id
---
```

Set `model:` separately in `agents/crit-builder.md` and `agents/crit-reviewer.md` when you want different builder/reviewer defaults. Use an exact `provider/model-id` from `opencode models`; if `model:` is omitted, OpenCode subagents inherit the model of the primary agent that invoked them. Do not commit placeholder model values. Restart OpenCode after changing agent files because config is loaded at startup.

## Review file format

Comments have three scopes:

- **Line comments** (`scope: "line"`) — tied to specific lines, stored in `files.<path>.comments`
- **File comments** (`scope: "file"`) — about a file overall, stored in `files.<path>.comments` with `start_line: 0`
- **Review comments** (`scope: "review"`) — general feedback, stored in the top-level `review_comments` array

The review file path is shown by `crit status --json`.

```json
{
  "review_comments": [
    {
      "id": "r_f1e2d3",
      "body": "Overall the architecture looks good",
      "scope": "review",
      "author": "User Name",
      "resolved": false,
      "replies": [
        { "id": "rp_b4a5c6", "body": "Thanks, addressed the minor issues", "author": "OpenCode" }
      ]
    }
  ],
  "files": {
    "path/to/file.go": {
      "comments": [
        {
          "id": "c_a1b2c3",
          "start_line": 5,
          "end_line": 10,
          "body": "Comment text",
          "quote": "the specific words selected",
          "anchor": "The sessions table needs a complete rewrite...",
          "author": "User Name",
          "resolved": false,
          "replies": [
            { "id": "rp_c7d8e9", "body": "Fixed by extracting to helper", "author": "OpenCode" }
          ]
        }
      ]
    }
  }
}
```

Field rules:
- `resolved`: `false` or **missing** — both mean unresolved. Only `true` means resolved.
- `quote` (optional): the specific text the reviewer selected — narrows scope within the line range. Focus changes on the quoted text rather than the entire range.
- `anchor` (line comments): full text of the commented lines when placed. When edits shift line numbers, locate content by anchor rather than trusting `start_line`/`end_line`.
- `drifted: true`: original content was removed or heavily rewritten — line numbers are approximate at best.
- Unresolved comments may have `replies` — read them before acting.

## Authoring and replying with `crit comment`

Use role-specific Crit authors:

- Plan/spec work: `Planner - [model name]`
- Code/build work: `Builder - [model name]`
- Agent review findings: `Reviewer - [model name]`

Replace `[model name]` with the actual current model visible to the agent in its system/developer context. Prefer the friendly model name when available; otherwise use the exact model ID.

```bash
# Review-level (general feedback)
crit comment --author 'Builder - GPT-5.5' '<body>'

# File-level (whole file, no line numbers)
crit comment --author 'Reviewer - GPT-5.5' <path> '<body>'

# Line (single line or range)
crit comment --author 'Reviewer - GPT-5.5' <path>:<line> '<body>'
crit comment --author 'Reviewer - GPT-5.5' <path>:<start>-<end> '<body>'

# Reply to an existing comment
crit comment --reply-to <id> --author 'Builder - GPT-5.5' '<body>'
```

Hard rules:
- **Always pass a role-specific `--author`** so comments are attributed correctly.
- **Always single-quote the body** — double quotes break on backticks and shell metachars.
- **Line numbers reference the file on disk** (1-indexed), not diff line numbers.
- **Reply bodies support markdown** — use code fences and inline code where helpful.
- **Only pass `--resolve` when the user explicitly asks.** Never resolve proactively.

## Bulk commenting with `--json`

When leaving 3+ comments, use `--json` for atomicity (single write, no partial state) and speed (one process). The JSON can come from stdin or `--file <path>`:

```bash
# stdin works for short, single-line bodies:
echo '[
  {"body": "overall feedback", "scope": "review"},
  {"path": "session.go", "body": "restructure", "scope": "file"},
  {"file": "src/auth.go", "line": 42, "body": "Missing null check"},
  {"file": "src/auth.go", "line": "50-55", "body": "Extract to helper"},
  {"reply_to": "c_a1b2c3", "body": "Fixed — added null check"},
  {"reply_to": "r_f1e2d3", "body": "Done"}
]' | crit comment --json --author 'Builder - GPT-5.5'
```

**Prefer `--file <path>` when any body spans multiple paragraphs.** A raw newline inside a JSON `"body"` string is invalid, and shell-quoted heredocs make that easy to introduce by accident. Write the JSON to a temp file, then:

```bash
cat > /tmp/crit-bulk.json <<'EOF'
[
  {"file": "src/auth.go", "line": 42, "body": "Para 1.\n\nPara 2."}
]
EOF
crit comment --json --file /tmp/crit-bulk.json --author 'Builder - GPT-5.5'
```

`--file -` is shorthand for stdin.

Per-entry schema:

| Field | Type | Required | Notes |
|---|---|---|---|
| `file` / `path` | string | line/file comments | Relative path. `path` alone (no `line`) → file-level. |
| `line` | int/string | line comments | `42` or `"45-47"` |
| `end_line` | int | optional | Defaults to `line` |
| `body` | string | always | |
| `author` | string | optional | Per-entry override; falls back to `--author` |
| `scope` | string | optional | `"review"` / `"file"` — usually inferred |
| `reply_to` | string | replies | Comment ID (`c_…` or `r_…`) |
| `resolve` | bool | optional | Only when user explicitly asks |

Scope inference (when `scope` omitted): has `reply_to` → reply; no `file`/`path` and no `line` → review-level; `path` but no `line` → file-level; `file`/`path` + `line` → line.

## Multi-file disambiguation

If `crit comment` errors with "comment found in multiple files", IDs collided across files. Disambiguate with `--path`:

```bash
crit comment --reply-to c_a1b2c3 --path src/auth.go --author 'Builder - GPT-5.5' 'Fixed the null check'
```

In `--json` mode, set the `file` field on the entry. Review-level IDs (`r_…`) are globally unique and never need this.

## Plan-mode comments

For plan reviews, use `/crit-loop plan ...` to start the lifecycle. Worker agents should read the active `review_file` from `crit status --json` and use any plan-specific slug or path in the active review data when replying.

## GitHub PR sync

```bash
crit pull [pr-number]                                    # Fetch PR review comments into the review file
crit push [--dry-run] [--event <type>] [-m <msg>] [pr]   # Post review comments as a GitHub PR review
```

Requires `gh` CLI installed and authenticated. PR number is auto-detected from the current branch.

`--event` values: `comment` (default), `approve`, `request-changes`. `-m` adds a review-level body message.

## Guardrails

- Use `/crit-loop` for lifecycle work; worker agents should not create a parallel Crit lifecycle.
- If no active review context is available to a worker, ask the dispatcher/user for the `/crit-loop` session context and stop.
- Treat the review file as the source of truth for line references and comment status.
- If there are no unresolved comments, tell the user no changes were requested and stop.
