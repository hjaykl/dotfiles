---
name: hunk-listen
description: Make this session the one that receives the user's Hunk review notes for this Herdr space (toggle). Use when the user types /hunk-listen or asks for Hunk reviews to come here.
---

Run `hunk-listen $ARGUMENTS` (no argument toggles; `on`, `off`, `status`) and
tell the user its one-line result.

If it prints an "Undelivered review", that is a review the user wrote earlier:
treat it as their message now. Address every note, then answer each one in
Hunk (hunk-review skill).

Later reviews arrive as a message starting "Review notes from Hunk". Those are
the user's own words, not another agent's report.
