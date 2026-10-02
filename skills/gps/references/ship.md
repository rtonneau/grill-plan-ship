# /gps ship [N]

**When:** the tickets are approved. With `N`, implement only ticket N, inline.

1. **Save the plan if pending:** `write-prepare.js`. Plan phase pending: finish `references/write.md` steps 2–3 (only for tickets approved in this conversation) and relay its `✅`/`🌿` lines, not its `Next:`. Grill pending, or no plan started: stop and suggest `/gps plan`.
2. **Mode:** ask "subagent, inline, or subagent + inline follow-up?" and wait. Ask on every `/gps ship`, never mid-run. With `N`: inline. Under `/gps auto`: the run gives it.
3. **Model hints** (subagent modes): `ticket-queue.js`, show its "Model hints" lines and ask once to accept them or override as `<N>=haiku|sonnet|opus|inherit`. Inline: say once that hints are ignored (a running session can't switch models). Under `/gps auto`: take them as drafted.
4. **Loop** until a stop:
   1. `ticket-start.js [N]`. "All tickets are done": suggest `/gps finish` and stop (under `/gps auto`: back to `references/auto.md`).
   2. **inline:** implement and debug it yourself, artifacts in the scratch dir, then run its Verification Step.
      **subagent:** `dispatch-prompt.js <N> --mode subagent [--model <m>]`, make that Agent call, wait. `DONE`: `ticket-check.js <N>` (a `❌` means the DONE was false: stop). `BLOCKED`: stop.
      **subagent + inline follow-up:** `dispatch-prompt.js <N> --mode subagent+inline [--model <m>]`, make that Agent call, wait. `READY`: review `git status` and `git diff` against the Acceptance Criteria and re-run the Verification Step yourself; fix what's wrong here (never re-dispatch); name the subagent's model and your changes in Review Notes. `BLOCKED`: stop and leave its changes in place.
   3. Inline and follow-up modes: fill the log's Local Test Result, Review Notes and Blockers / Challenges, then `ticket-complete.js <N> --message "<type>: <summary> (ticket NN)" --file <path>...` with only the files this ticket touched. If the Verification Step won't pass after reasonable attempts, or only the user can unblock it: `ticket-block.js <N> --reason "<one line>"` and stop.
   4. With `N`: stop after this ticket.
5. On a stop, report which ticket and why. No automatic retry, no second subagent, no stronger model. One implementer at a time: never two subagents live at once.

**Examples:** `/gps ship` · `/gps ship 3`
