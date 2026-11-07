# Chunk <n>: <title>

- Base commit: <sha> (do not change commits at or before it)
- What to do: <the step from .plan.md>
- Acceptance criteria: <from .plan.md>
- Context: <paths/sections in .feature/research.md and .plan.md; likely files from the plan>
- Checks: <narrow targeted tests, lint/typecheck>; never the full suite or `nx affected -t test`
- Commit: one human-review-friendly commit for the chunk
- Report: `.feature/reports/<n>-impl-r1.md`, then `hc send <overseer> "chunk <n> committed <sha> — <path>"`
