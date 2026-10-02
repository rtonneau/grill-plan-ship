# /gps status

**When:** reorienting: back on a project, after a break or lost context, after `/gps scout`. Read-only.

1. `status.js`. Relay the report as is, ending with its `Next:` line; don't work out the next command yourself.
2. If it says the current session can't be resolved, ask the user which session to use, then `set-current.js <session-id>`.
3. A saved handoff is part of the report: use its narrative (where work stopped, next step, settled decisions) to pick the work back up.

**Example:** `/gps status`
