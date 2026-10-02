# /gps auto

**When:** You trust the direction and want the session to run from its current phase to a target without stopping: `plan` (plan and tickets written), `ship` (every ticket implemented) or `finish` (the default: session closed, PR opened on GitHub projects).

**Run:** `node $CLAUDE_PLUGIN_ROOT/skills/gps/scripts/auto-route.js [--delegate] [plan|ship|finish]`

`--delegate` presets the ship mode to subagent + inline follow-up: each ticket's subagent implements it on the model from its `**Model:**` hint, then this session reviews, finishes and commits it. Pass it through when the user typed it. On a route without a ship step it is ignored with a `⚠️` line.

**Steps:**

1. Run the handler. It prints JSON with `steps` (in order, from `write:grill`, `plan`, `write:plan`, `ship`, `finish`), `questions`, and `shipMode` when `--delegate` preset it, and records `auto_started` in the session history. On `❌`, relay it and stop.
2. Before asking anything: a first step of `write:grill` needs a grill design approved in this conversation, and `write:plan` needs tickets drafted in it. `/gps write` only transcribes, so if that content isn't here, stop and say so (finish the grill, or draft the tickets, first).
3. If `questions` has `ship-mode`, ask it once with `AskUserQuestion`: subagent, inline, or subagent + inline follow-up. If the JSON has `shipMode` instead (`subagent+inline` = subagent + inline follow-up), use it and don't ask. Ask nothing else before or during the run.
4. Run each step in order: read its references file (`write.md`, `plan.md`, `ship.md`, `finish.md`) and run it as if typed, with these overrides:
   - `write:grill` / `write:plan`: `write.md` steps 1–3, including fixing the payload after a `❌`.
   - `plan`: writing-plans only drafts here: don't execute its plan, don't ask for a review or an execution method, and don't treat the ship-mode answer as one (it is for `/gps ship`). Once the tickets are drafted (writing-plans, then unslop), they count as approved: go straight to the next step.
   - `ship`: use the mode from step 3; take each ticket's model hint as drafted and don't ask to confirm it. When `nextPending` is null, come back here for the next step instead of stopping.
   - `finish`: run as typed. Its closing "switch to an unfinished session?" question is still asked, since the run is over by then.
5. After each step, relay everything it prints (including `⚠️` lines) except its `Next:` suggestion, since the run already knows the next step. A `⚠️` doesn't stop the run, but repeat every one in the final report (e.g. a pull request that was not opened). The first failure ends the run: a handler `❌` (other than the payload fix above), a BLOCKED ticket or an inaccurate DONE. Report which step stopped it; finish never runs after an incomplete ship.

**Examples:** `/gps auto`, `/gps auto plan`, `/gps auto ship`, `/gps auto --delegate`
