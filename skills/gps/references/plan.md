# /gps plan

**When:** the grill design is approved.

1. `write-prepare.js`. If the grill phase is pending, finish `references/write.md` steps 2–3 now (only for a design approved in this conversation; otherwise say the grill must be finished first). Relay write-apply's `✅` line, not its `Next:`.
2. `plan.js`.
3. Draft the tickets at once with `writing-plans` (superpowers), working from the resume `plan.js` names. Missing: draft them yourself and say once that `superpowers` gives a fuller planner. Make each ticket one independently committable change, ordered so every ticket builds on committed work, with the fields of the ticket block `write-prepare.js` prints: Acceptance Criteria, Files to Touch, a Verification Step command with its expected output, Notes. Then run `unslop` on each ticket (missing: skip it and say so). Give each ticket a `**Model:**` line and keep it through unslop:
   - `haiku`: mechanical work (renames, docs, config, one file with an obvious pattern)
   - `sonnet`: ordinary implementation
   - `opus`: cross-file design judgment or tricky debugging
   - `inherit`: unsure
4. Once the user approves the tickets: `/gps ship` saves and implements them (`/gps write` only saves them; `/gps auto` runs on to finish).

**Example:** `/gps plan`
