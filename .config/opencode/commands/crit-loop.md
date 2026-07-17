---
description: Primary Crit entrypoint; run a full Crit lifecycle and delegate build/review work
agent: crit-dispatcher
---

# Crit Loop

Use this as the primary way to invoke Crit from OpenCode. Own the Crit lifecycle for this review using the dispatcher workflow.

Arguments passed to this command are the Crit target arguments:

```text
$ARGUMENTS
```

If arguments are empty, run bare `crit` for the current git changes.

Configuration notes live in `skills/crit/SKILL.md`:

- **Different builder/reviewer models:** add `model: provider/model-id` to `agents/crit-builder.md` and/or `agents/crit-reviewer.md`. If omitted, subagents inherit the invoking primary agent's model.

Follow the `crit-dispatcher` agent instructions exactly:

- Run Crit and block for human Finish Review / Approve.
- Delegate unresolved feedback to `crit-builder`, reusing the prior builder Task `task_id` when the dispatcher has an explicit saved id for that role; otherwise launch a fresh `crit-builder` worker.
- After each `crit-builder` or `crit-reviewer` worker returns, capture its concise summary and preserve that role's returned `task_id` for future reuse. Do not delete the persisted OpenCode worker session by default, and do not reuse a session id that is missing, ambiguous, or belongs to the other role.
- Delegate a follow-up review to `crit-reviewer`, reusing the prior reviewer Task `task_id` under the same explicit-role-id rule; the reviewer only leaves comments and must never mark a Crit review or round as finished.
- Re-enter Crit for the next human round.
- Stop only when approved, blocked, or a command fails.
