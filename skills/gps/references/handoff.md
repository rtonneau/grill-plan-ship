# /gps handoff

**When:** stopping work on the current session (end of day, context running low, switching tasks) so a later session can pick it up with full context.

1. `handoff.js`. It writes HANDOFF.md with everything it can read from disk and git.
2. Fill the sections it names in HANDOFF.md with the Edit tool: where work stopped, the reasoning so far (alternatives tried and rejected), the next concrete action, open questions only the user can answer, decisions already settled, and why changes aren't committed (when it asks).

Each run overwrites the previous HANDOFF.md. `/gps status` shows it, with any drift since.

**Example:** `/gps handoff`
