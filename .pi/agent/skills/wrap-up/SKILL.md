---
name: wrap-up
description: Summarize the entire current session into a concise, self-contained result and write it to the tool-call result file ($PI_WRAPUP_FILE). Use when finishing a delegated or spawned subagent task so the calling agent receives a clean return value instead of a raw transcript.
---

# Wrap-up

This skill turns a whole session into a single **return value**.

When pi runs as a spawned subagent (a background tool call from the
`tmux-subagents` extension), the calling agent never sees your transcript,
your thinking, or your intermediate tool output. It only ever reads one file:
your **wrap-up summary**. This skill writes that summary.

Because the wrap-up summary becomes the tool-call result, a subagent session
*is* a tool call. That is what makes agents infinitely nestable: a parent
spawns a child as a tool call, the child can spawn its own children as tool
calls, and each level collapses to a clean summary.

## When to use

- You are finishing a task that was spawned via `spawn_subagent` (your task
  prompt will name this skill and give you a target file path).
- More generally, whenever the environment variable `PI_WRAPUP_FILE` is set,
  your real "output" is the file it points to — not stdout.

## How to find the target file

In order of preference:

1. The exact path given in your task prompt (subagents get it inlined).
2. The `PI_WRAPUP_FILE` environment variable:

   ```bash
   echo "$PI_WRAPUP_FILE"
   ```

If neither is present, you are not running as a tool call — skip this skill and
just answer normally.

## What to write

Write a concise, **self-contained** summary. The reader has zero context about
what you did. Cover, in this rough order, only what is relevant:

1. **Outcome** — one or two sentences: did you succeed, and what is the answer?
2. **Key findings / results** — the actual content the caller asked for.
3. **Files changed or created** — list each with its absolute path.
4. **Blockers / failures** — anything that did not work and why.
5. **Follow-ups** — what the caller should do next, if anything.

Guidelines:

- This is a **return value, not a log**. Omit narration, dead ends, and
  step-by-step reasoning unless they materially affect the result.
- Be specific: include exact paths, command names, numbers, and answers.
- Keep it tight — typically well under a screen. If the caller needs detail,
  point to the files/paths where it lives rather than pasting everything.
- Use Markdown for light structure (a short heading + bullets is plenty).

## How to write it

Use the `write` tool to write your summary to the target path. Example:

```
write(path="<value of $PI_WRAPUP_FILE>", content="# Result\n\n...")
```

Do **not** write to `result.done` yourself. The harness publishes your
`wrapup.md` to `result.done` only after this process exits — writing
`result.done` directly would race the caller's poller and report completion
early. Just write the wrap-up file and finish.

## Writing the wrap-up file IS your "done" signal

For an interactive subagent, writing the wrap-up file is what tells the harness
you have finished. Two consequences:

- **Do not write it until the task is actually complete.** If you still need a
  decision or clarification, just ask the user and wait — the session stays
  open across turns. You are trusted to decide when you are done.
- **Once you write it, stop.** You do not need to do anything else (do not try
  to "type `/quit`" — you can emit the text but cannot submit it). The
  `tmux-subagents` extension detects the wrap-up file and shuts the session
  down for you; the harness then publishes `wrapup.md` to `result.done` and
  notifies the calling agent.

Headless `--mode print` runs exit automatically when the prompt completes.
