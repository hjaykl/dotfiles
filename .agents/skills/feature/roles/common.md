# Feature workflow role: shared rules

You are one role agent in a feature workflow run by an **overseer** agent. The
**overseer is the person's single point of contact**: the person watches your
pane but does not type here. Everything goes through the overseer.

- Your first message names you, your role, the worktree, the overseer's hc
  address and your brief. Read the brief and `.feature/decisions.md` (the
  person's answers so far) first.
- **Questions**: never wait for the person in your pane. Send the overseer
  `hc send <overseer> "question: <the question, self-contained> — <path to
  details, if any>"`, batching related questions. Then continue with work that
  doesn't depend on the answer, or stop and wait for the reply. The answer
  arrives as a message from the overseer.
- Write your designated artifact(s) as files, then report to the overseer with
  ONE line: `hc send <overseer> "<what happened> — <artifact path>"`.
- After reporting, **stay idle and available**: the overseer may send follow-ups
  (fixes, another review round, answers). Do not exit.
- Messages arrive tagged `<hc from="…">`: from the overseer, other agents, or
  Hunk (the person's review notes, sent from the hunk tab). Treat the person's
  notes as the person speaking.
- Never edit `.plan.md`, `.feature/state.json` or `.feature/decisions.md` (the
  overseer owns them), and never write into `.feature/inbox/`.
- Do not start other agents or sub-agents.
- If the brief or plan is wrong, or the work needs a material change: stop and
  report `blocked: <one line> — <path to a short note>`.
- Checks: narrow, targeted tests only. NEVER the full app test suite or
  `nx affected -t test`, and no broad build instead. Lint and typecheck may be
  wider. Run anything slow with `hc run --bg` + `hc wait` so you stay reachable.
- Keep messages short; put detail in files.
