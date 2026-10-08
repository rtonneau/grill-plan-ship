# /gps plan

**When:** the grill design is approved.

1. `write-prepare.js`. If the grill phase is pending, finish `references/write.md` steps 2–3 now (only for a design approved in this conversation; otherwise say the grill must be finished first). Relay write-apply's `✅` line, not its `Next:`.
2. `plan.js`.
3. Draft the tickets at once with `writing-plans` (superpowers), working from the resume `plan.js` names. Missing: draft them yourself and say once that `superpowers` gives a fuller planner. Make each ticket one independently committable change, ordered so every ticket builds on committed work, with the fields of the ticket block `write-prepare.js` prints: Acceptance Criteria, Files to Touch, a Verification Step command with its expected output, Notes. Then run `unslop` on each ticket (missing: skip it and say so). Give each ticket a `**Model:**` and an `**Effort:**` line and keep them through unslop:
   - Model: default to `haiku` whenever the ticket is small, clear and of a kind that recurs often in this plan (renames, docs, config, one file with an obvious pattern) — most mechanical tickets qualify. Reach for `sonnet` only once the ticket needs ordinary multi-step implementation judgment, `opus` only for cross-file design judgment or tricky debugging, and `inherit` only when genuinely unsure. See [docs/decisions/0004-model-hints-stay-family-level.md](../../../docs/decisions/0004-model-hints-stay-family-level.md) for the full breakdown.
   - Effort `low`: the change is spelled out; `medium`: ordinary; `high`: subtle logic or several files to keep consistent; `xhigh`: hard reasoning a mistake would be costly in; `inherit`: unsure. There is no `max`: a ticket that seems to need it should be split instead (`write-apply.js` refuses it).
4. Ask for approval of the tickets with `AskUserQuestion`. Once approved: `/gps ship` saves and implements them (`/gps write` only saves them; `/gps auto` runs on to finish).

**Example:** `/gps plan`
