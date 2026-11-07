# Feature workflow — approved v1 build handoff

You are the fresh build agent. The user explicitly requested claude-opus-5.5 in Herdr because the previous conversation is filling up. Build the tooling fully, verify it, install it, then help trial it with the user. Your parent/previous conversation is hc terminal t2k; report milestones/blockers there with hc send t2k. The user will converse directly with you in your Herdr pane. This is a BUILD agent, not the feature overseer: you may read/write tooling source code.

## Source and permission

Read /Users/jacob.poole/.dotfiles/docs/feature-workflow.md as the original proposal. The contract below supersedes all conflicting details there. The user has approved this contract and authorized building in .dotfiles and trying the result. They have not approved any implementation plan for the trial feature. Do not change Electroverse feature code until that workflow has gone through research, configuration, and user planning approval.

Work in /Users/jacob.poole/.dotfiles. Repo instructions: CLAUDE.md (no root AGENTS.md found). Dotfiles initial git status was clean. No implementation files or acceptance ledgers have been created yet; only this handoff document is new. Previous agent inspected integrations read-only.

## Approved contract

### Kickoff/configuration
- /feature <ticket ID, Linear URL, or plain-language task>. No args asks for task. Recognizable ticket fetches Linear, other text is a task brief. Ticket is optional.
- Current pi conversation becomes the feature overseer; selecting its model switches this session and preserves conversation.
- Available-model pick lists, not typed model IDs; scope lists to ctx.scopedModels when configured. Validate model availability/auth at configuration; support actual thinking capabilities.
- Normal kickoff discusses preset/config then picker. --quick skips this discussion, still shows picker, and Start authorizes kickoff. Planning discussion/Hunk approvals are not skipped.
- Picker includes presets, enabled roles, per-role provider/model/thinking, reviewer standards, save-as-defaults. No parallelism/tester/archive/Linear-comment controls.
- Tiny: implementer + Hunk (overseer directly briefs implementer; no planner approval phase).
- Medium: planner + implementer + reviewer + Hunk.
- Full: researcher + planner + implementer + reviewer + Hunk. NO tester in v1.
- Choose role model defaults from currently available models through the UI; proposal's model names are placeholders. Do not silently decide all user model preferences.
- Researcher may access whatever relevant repo/connected-service sources it deems necessary (no explicit source allowlist needed).

### Roles/coordination
- Overseer avoids reading/editing source code to keep its context lean, like an engineering manager. Prompt convention, not strict security/tool restriction. Reads summaries, reports, workflow state, git metadata.
- Researcher investigates vague requirements; separates evidence and assumptions, presents findings and asks user remaining product questions DIRECTLY IN ITS HERDR PANE before handoff.
- Planner converses with user directly in its own pane; user approves implementation plan there. Herdr notifies when agents wait for user. Researcher resolves product ambiguity; planner owns implementation-plan approval.
- Serial chunks; one fresh implementer per chunk retained through review/fixes. No parallel implementers.
- Material plan changes: pause, report problem, overseer proposes adjustment for user approval; planner returns for substantial changes.
- Agent names must be unique per feature (hc names are globally unique among live terminals, max 32 chars). Include feature identity labels, not feature.role alone.
- Roles write designated artifacts and send short report paths to overseer, then wait idle (interactive pi, NEVER -p). No role edits authoritative plan/state.

### Review loop — important departure from original proposal
1. Implementer commits human-review-friendly chunk and stays available.
2. Reviewer examines exact revision, records findings WITHOUT fixes.
3. Overseer opens unchanged whole chunk in Hunk with attributed reviewer inline comments.
4. User sees where implementer went wrong; reviewer is advice, not a hidden blocking prefilter.
5. User approves / requests changes / submits comments without a decision.
6. Requested changes return to SAME implementer. Bias amend existing chunk commit; separate fix commits allowed for truly separate work. Review chunk base..latest revision, not only latest fix commit.
7. Rerun reviewer after fixes; show whole revised chunk again.
8. Only explicit user approval advances next chunk. User overrides reviewer. No two-round automatic-fix policy; user controls fixes.
- Submit comments (p) or quit: deliver notes ONLY, do not authorize changes or approval within feature workflow. Preserve non-feature existing behavior.
- Approve with comments: notes are nonblocking; do not launch fixes. Approval overrides reviewer findings.
- Dismiss reviewer finding using ordinary Hunk reply e.g. 'not useful: ...' or 'accepted tradeoff: ...'; preserve reply/findings for future reviewer improvement. Approval without reply records override without inventing rationale.
- Add approve/request-changes to Hunk Extensions menu; suitable shortcuts if available. Overseer /feature approve and /feature request-changes fallbacks.
- Optional 'approve with unresolved comments?' confirmation only if existing Hunk semantics make straightforward. Avoid inventing complex thread resolution for v1.
- Bind decision to exact feature/chunk/revision/session to prevent stale approval advancing changed code; persist feedback/decisions for recovery. Preserve evidence from prior review rounds.

### State/recovery
- Human-readable .plan.md at worktree root: goal, approach, workflow/config summary, numbered steps with acceptance criteria, progress/current status, blockers, decisions. Avoid bulky machine metadata/frontmatter.
- .feature/state.json: exact configuration and operational bookkeeping (feature identity, overseer/role addresses, phases, chunk bases/revisions, review rounds/decisions, etc.).
- .feature/: research, plan draft, briefs, per-round implementation/review/Hunk reports. Overseer sole writer plan/state; roles designated own artifacts.
- Globally ignore .plan.md and .feature/ (respect existing core.excludesFile; do not clobber user's ignore config).
- Existing state: offer resume, never overwrite silently. Dirty worktree: ask relation before implementation. Record starting commit to avoid including prior work in chunks.
- Workflow agents should --outlive-parent so overseer restart doesn't kill them. Explicit cleanup only owned terminals after approval/completion.
- Resume reconnects surviving agents; replace lost implementer from brief/reports/feedback without blindly repeating completed work. Reconcile git and state; ask user on disagreement.
- Fresh overseer can resume from files; status from human plan + exact state + hc + git metadata. Keep messages short.

### Checks/finish
- Human understandable chunks aim functional, but passing all checks per intermediate chunk is not strict; explain failing checks.
- Narrow targeted tests allowed. NEVER full app test suite or nx affected test. Lint/type checks may be wider. Use hc for long checks to remain reachable; don't run broad expensive builds as substitute for forbidden suite.
- NO tester/QA, browser checks, screenshot/video QA, CI babysitter, archive, retro or ready-for-review promotion in v1. These are user-deferred, not unfinished v1 requirements.
- At end push branch + generate PR description + OPEN DRAFT PR automatically (no final confirmation), no Linear comment or mutation. Stop once draft PR opened. Leave state files in place. No CI wait.
- Make status/finish accurate; do not claim real-ticket end-to-end finished while waiting for user input.

## Trial

Worktree: /Users/jacob.poole/.herdr/worktrees/ElectroverseWeb/fle-2172-port-the-fleet-admin-sidebar-dashboard-layout-to-the-app
Ticket: https://linear.app/electroverse/issue/FLE-2172/port-the-fleet-admin-sidebar-dashboard-layout-to-the-app-router-app
Ticket intentionally vague: researcher must fill details, discuss unknowns with user before planner. Recommend full preset. Trial worktree git status --short was clean when inspected.
Existing Herdr trial space: spbbfbd2d01ca8403a86220efb1cc530b9; existing tab tb58f380df9a06bbe45c240ce77f8f8533, shell t64. Reconfirm IDs before use.
Current build-discussion space: sp9dba055e4245d7d325e81c62e0d5b24d; tab tb6c9b71eba6a85d82b0033f771b38e88b; parent pane p72a31581c6a468473a6c1e98e6b24555. Build working directory is dotfiles, not trial worktree.

## Existing integration findings and paths

- /Users/jacob.poole/.dotfiles/.pi/agent/extensions/hunk-listen.ts (live symlink ~/.pi/agent/extensions/hunk-listen.ts). One socket listener per Herdr space/tmux session, supports ping/review/release JSON lines. review currently only text/file. busy deliveries as followUp. Pending .txt files under ($XDG_RUNTIME_DIR or /tmp)/hunk-pi/<session-key>.pending. Listener takeover confirmation; pending delivery currently deletes copies before delivering (consider reliability).
- /Users/jacob.poole/.dotfiles/.config/hunk/extensions/pi-send.ts (live config symlink ~/.config/hunk -> ../.dotfiles/.config/hunk). p sends changed/unsent saved USER notes only; shutdown persists unsent notes then tries socket. Includes Hunk session id selected by PID; records note id/ranges/parent references. Current message instructs 'Address each note' — MUST change for feature context while preserving ordinary workflows. Hunk snapshot exposes resolution != orphaned, but not established semantic unresolved-thread state.
- /Users/jacob.poole/.dotfiles/.bin/hunk-open. Creates/replaces tab named hunk in current Herdr space (closing old review sends unsent notes). hunk-open show <ref> / diff <base> <tip>. Background wrapper kills own terminal on Hunk exit. Uses ~/.bin/lib/nvim-session.sh for space key and editor.
- hunk session comment add/apply supports inline notes with --author and replies --reply-to. Agent notes hidden by default; --focus on first note enables visibility, or --agent-notes startup flag.
- Hunk CLI exposes session list/get/review/context/reload/comments/highlights. Use exact session IDs to avoid other workstreams. No approve/request-changes in installed protocol yet.
- install.sh stows dotfiles but EXCLUDES .pi in .stow-local-ignore. Explicit extension-link loop currently only hunk-listen.ts; add feature workflow and any required helper links without executing the entire bootstrap installer.
- Repo .gitignore currently .claude, /.bin/pi, *.bak. No implementation/GATES/PLAN/.unlazy created yet.
- CLI models available: github-copilot / claude-opus-5.5 (user specifically requested this for build), also litellm / GLOBAL claude-opus-5-5. pi --list-models returns provider/model/limits and no credentials. Never read/output secrets.
- hc names max 32 a-z0-9-_; run --bg --outlive-parent --cwd ... --label feature.id=... --label feature.role=... -- pi --provider ... --model ... --thinking ... --append-system-prompt <role file> '<initial task>'. Keep interactive. First task in argv avoids readiness race. hc wait --children any, process reports, wait again. No sleep/poll for agent completion.
- hc get status idle/working/done/blocked/error; timeout isn't failure. Blocked needs user; no --force to bypass permission.

## Docs/skills to read BEFORE implementation

Read relevant full docs/examples for pi extension implementation:
/Users/jacob.poole/.pi/agent/install/releases/1.5.0/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md (3348 lines, read chunks; prior agent read only initial 1123 + setModel section)
Related skills.md, tui.md, models.md, examples/extensions/preset.ts, appropriate UI/tool examples. Resolve examples/docs under installed pi package, not dotfiles cwd.
pi exposes pi.setModel(model) (false on missing auth), pi.setThinkingLevel (clamps), ctx.modelRegistry.getAvailable(), ctx.scopedModels (model+optional pinned thinking), pi.events bus. setModel records session state, does not alter global defaults. Send user messages with expandPromptTemplates:true if wanting /skill: expansion/extension-command execution. Verify actual lifecycle semantics, no guesswork.
Read /Users/jacob.poole/.agents/skills/herdr-core/SKILL.md then hc --skill and herdr-app --skill.
Read /Users/jacob.poole/.agents/skills/hunk-review/SKILL.md then hunk skill show hunk-review.
For modifying pi-send, run hunk skill show hunk-extensions; linked source truth docs outside checkout: https://hunk.dev/docs/extend/extensions/ and companion extension-api; installed declaration via hunkdiff npm package if needed. Do not launch Hunk TUI headlessly or pipe it for tests; unit/mock + actual user trial, or supported PTY harness.
Use unlazy skill for substantial build: /Users/jacob.poole/.agents/skills/unlazy/SKILL.md. Write observable acceptance gates before real code; no ledgers yet. Use solo ledger if appropriate, or orchestrated contract/tree and disjoint claims if delegating. Read full referenced docs if using orchestration. No hooks installed/authorized. Avoid contaminating global stow with build ledgers.

## Suggested build/verification approach (not rigid architecture)

Implement robust reusable state/review protocol helpers with tests plus lightweight skill-driven orchestration. Skill/roles/templates/defaults + pi picker/commands + Hunk protocol changes + installation + docs. Deterministic review authorization/revision identity checks important; don't rely solely on prose to ignore stale messages. Ensure dependencies resolve in deployed extension, not only repository. No placeholder models or pretend tests. Add targeted mock/UI/state/recovery integration checks including negative controls: unavailable models, cancellation, stale revision approval, comment-only no edits, reviewer override, amendment/fix-commit range, existing dirty/state safeguards. Real picker and Hunk user interactions will be manual trial gates; be honest if awaiting them.

First tell user you have the handoff and are building. They asked the parent to transfer because of context; do not repeat all product questions or ask them to re-approve already agreed scope. Clarify only genuine implementation blockers. Do not automatically commit dotfiles unless user requests; original proposal's polish commit isn't confirmed as required. Keep build/testing scope narrowly on new tooling, no full Electroverse suite.
