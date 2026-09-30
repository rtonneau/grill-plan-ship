# /gps auto

**When:** You trust the direction and want the session to run from its current phase to a target without stopping: `plan` (plan and tickets written), `ship` (every ticket implemented) or `finish` (the default: session closed, PR opened on GitHub projects). `/gps write+finish` is `/gps auto finish`; it runs even when the grill is already written, and the route then starts at `plan`.

**Run:** `node $CLAUDE_PLUGIN_ROOT/scripts/auto-route.js [plan|ship|finish]`

**Steps:**

1. Run the handler. It prints JSON with `steps` (in order, from `write:grill`, `plan`, `write:plan`, `ship`, `finish`) and `questions`, and records `auto_started` in the session history. On `❌`, relay it and stop.
2. Before asking anything: a first step of `write:grill` needs a grill design approved in this conversation, and `write:plan` needs tickets drafted in it. `/gps write` only transcribes, so if that content isn't here, stop and say so (finish the grill, or draft the tickets, first).
3. If `questions` has `ship-mode`, ask it once with `AskUserQuestion`: subagent, inline, or subagent + inline follow-up. Ask nothing else before or during the run.
4. Run each step in order: read its references file (`write.md`, `plan.md`, `ship.md`, `finish.md`) and run it as if typed, with these overrides:
   - `write:grill` / `write:plan`: `write.md` steps 1–3, including fixing the payload after a `❌`.
   - `plan`: once the tickets are drafted (writing-plans, then unslop), they count as approved: go straight to the next step. Skip writing-plans' own execution hand-off question.
   - `ship`: use the mode collected in step 3; take each ticket's model hint as drafted and don't ask to confirm it.
   - `finish`: run as typed. Its closing "switch to an unfinished session?" question is still asked, since the run is over by then.
5. After each step, relay its `✅`, `🌿` and `🔀` lines, never its `Next:` suggestion. The first failure ends the run: a handler `❌` (other than the payload fix above), a BLOCKED ticket or an inaccurate DONE. Report which step stopped it; finish never runs after an incomplete ship.

**Examples:** `/gps auto`, `/gps auto plan`, `/gps auto ship`, `/gps write+finish`
