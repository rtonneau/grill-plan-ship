# /gps ticket <number>

**When:** Starting implementation of a single ticket by hand. To implement every remaining ticket in one go, use `/gps ship` instead.

**Run:** `node $CLAUDE_PLUGIN_ROOT/scripts/ticket.js <number>`

**What it does:**

1. Fails unless the plan phase has been written (`/gps write`); `<number>` must be digits (`3`, `03` and `003` are the same ticket).
2. Reads `02-plan/tickets/NN-<slug>.md` (if several files share the number, the first not-yet-done one in filename order)
3. If that ticket's `commit-log.md` says `**Status:** ✅ Done`, reports that and changes nothing.
4. Otherwise creates `03-implement/NN-<slug>/` and a `commit-log.md` template — **an existing log is kept, never overwritten**, so an interrupted ticket resumes from its notes.
5. Records this ticket's token-usage phase key (`03-NN-<slug>`) in `.session-config.json`, so usage can be computed later when the ticket is finalized
6. Prints ticket spec to console, including that phase key and the session's scratch dir (backfilled, with a warning, for sessions started before scratch dirs existed)
7. Records a `ticket_started` event (once per ticket) in the session history in `.session-config.json`.

When the ticket is done — its Status line set to exactly `**Status:** ✅ Done` — run `node $CLAUDE_PLUGIN_ROOT/scripts/ticket-done.js <number>` to record the completion time. It refuses unless the log says Done, and does nothing if the ticket was already recorded.

**Output:** Workspace + spec printed. Ready to code.
