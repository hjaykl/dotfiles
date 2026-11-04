---
description: "Register with LGTM daemon and listen for work. Usage: /lgtm <role> (e.g. /lgtm Builder, /lgtm Reviewer)"
---

# LGTM Listen

Register this agent with the LGTM daemon and enter a listen loop.

The user's arguments specify the role:

```text
$ARGUMENTS
```

If no arguments are provided, ask the user which role to register as (e.g. Builder, Reviewer).

## Steps

1. Check the daemon is reachable: `lgtm whoami`
   - If it fails, tell the user to run `lgtm serve` and stop.

2. Track the current repo: `lgtm track`

3. Get or create an agent identity:
   - Check `echo $LGTM_ID`
   - If empty, run `lgtm id new --name "<role> - opencode"` using the role from the arguments (e.g. "Builder - opencode", "Reviewer - opencode") and `export LGTM_ID=<printed-id>`

4. Subscribe to this repo: `lgtm subscribe --repo $(basename $(git rev-parse --show-toplevel))`

5. Read the full protocol: run `lgtm protocol` and use its output as your instructions for how to interact with LGTM (authoring changes, reviewing, discussions, inbox rules, event types).

6. Tell the user your identity, role, and that you are now listening. Then enter the poll loop as described in the protocol:

```sh
lgtm next --wait --timeout 540 --json
```

Handle events according to the protocol. On timeout (exit 1), loop again.
