# /gps plan

**When:** After reviewing the grill session (resume.md approved).

**Run:** `node $CLAUDE_PLUGIN_ROOT/scripts/plan.js`

**What it does:**

1. Resolves the current session via `.work/sessions/.current-session`, then reads its `01-grill/resume.md` (fails if it still contains unfilled placeholders)
2. **Fails and changes nothing if `02-plan/plan.md` already exists** — its hint says whether to run `/gps write` (plan still pending) or `/gps ship` (plan already written).
3. Creates `02-plan/plan.md` and placeholder ticket stubs in `02-plan/tickets/` for `/gps write` to replace
4. Immediately invokes the `writing-plans` skill against the approved `resume.md` to generate the actual tickets, then invokes `unslop` on each resulting ticket (skipped with a notice if `unslop` isn't available) — do not wait for or ask the user to run these themselves

**Output:** The writing-plans conversation begins right away.

**Next:** Once the tickets are approved, run `/gps write` to save the plan and tickets to disk, then `/gps ship` to implement them.

## Dependencies

- `writing-plans` (superpowers) turns the approved resume into tickets. If it isn't available, stop and tell the user to install the `superpowers` plugin.
- `unslop` runs on each generated ticket for crisp language. If it isn't available, skip that step and tell the user it was skipped.
