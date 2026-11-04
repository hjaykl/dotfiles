---
name: lgtm
description: "Register this agent with the LGTM daemon, track the current repo, and enter a listen loop waiting for dispatched work or review events. Use when the user says 'listen on lgtm', 'start lgtm', or 'wait for work'."
compatibility: opencode
---

# LGTM Listen

When this skill is invoked, perform the following steps in order:

## 1. Ensure daemon is reachable

```sh
lgtm whoami
```

If this fails, tell the user to start the daemon with `lgtm serve` and stop.

## 2. Track the current repo

```sh
lgtm track
```

If already tracked, this is a no-op.

## 3. Get or create agent identity

Check if `LGTM_ID` is already set in the environment:

```sh
echo $LGTM_ID
```

If empty, create a new identity:

```sh
lgtm id new --name "Builder - opencode"
```

Capture the printed id and export it:

```sh
export LGTM_ID=<id>
```

## 4. Subscribe to this repo

```sh
lgtm subscribe --repo $(basename $(git rev-parse --show-toplevel))
```

## 5. Enter the listen loop

Tell the user you are now listening, then repeatedly poll:

```sh
lgtm next --wait --timeout 540 --json
```

When an event arrives, handle it based on its type:

### work.requested (assignment)

1. Read the event payload — it contains `body` (the brief) and `worktrees` (paths).
2. If the event carries tags, read those tags' discussions first:
   `lgtm discussions --tag <t> --json`
3. `cd` into the worktree path.
4. Do the work described in the brief — write code, commit on the branch.
5. Open the change for review:
   `lgtm open --base main --reviewer <reviewer-from-event> --title "<from-brief>" --body "<summary>"`
6. Ack the event: `lgtm ack <event-id>`
7. Continue listening for review feedback.

### review.requested / change.created

1. Read the change: `lgtm view <n> --json` and `lgtm diff <n> --json`
2. Review the code, leave comments:
   `lgtm comment <n> --file <path> --line <line> --body "..."`
3. Submit verdict: `lgtm review <n> --approve` or `--request-changes --body "..."`
4. Ack: `lgtm ack <event-id>`

### thread.created / comment.replied (feedback on your change)

1. Read threads: `lgtm comments <n> --unresolved --json`
2. Address feedback — fix code, commit, push.
3. Reply: `lgtm reply <thread-id> --body "fixed in <sha>"`
4. Resolve: `lgtm resolve <thread-id>`
5. Ack: `lgtm ack <event-id>`

### review.submitted with verdict "approve"

1. Tell the user the change was approved.
2. Ack: `lgtm ack <event-id>`
3. Continue listening.

### Timeout (exit 1)

Loop back to `lgtm next --wait --timeout 540 --json`. This is normal.

## 6. Always ack

Never ack an event you haven't fully handled. After acking, loop back to step 5.

## Key Reference

| Command | Purpose |
|---|---|
| `lgtm next --wait --timeout 540 --json` | Block for next event |
| `lgtm ack <event-id>` | Consume event |
| `lgtm view <n> --json` | Read a change |
| `lgtm diff <n> --json` | Get change diff |
| `lgtm comments <n> --unresolved --json` | Unresolved threads |
| `lgtm comment <n> --file <f> --line <l> --body "..."` | Leave comment |
| `lgtm reply <thread-id> --body "..."` | Reply to thread |
| `lgtm resolve <thread-id>` | Resolve thread |
| `lgtm review <n> --approve / --request-changes` | Submit verdict |
| `lgtm open --base <b> --reviewer <id> --title "..." --body "..."` | Open change |
