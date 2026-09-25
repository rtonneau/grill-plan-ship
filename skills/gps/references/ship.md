# /gps ship

**When:** After tickets have been saved to disk (`/gps write` has run for the plan phase). Takes no arguments — it works through whatever tickets remain.

**Mode:** Before running the ticket loop, ask: "Implement each ticket via a dispatched subagent, or inline in this session?" Wait for an explicit answer before continuing. Ask this every time `/gps ship` is invoked — never cache the answer in session state, and never re-ask mid-run; whichever answer you get applies to every ticket this invocation processes. `/gps ticket <N>` (manual single-ticket implementation) is unaffected — it always runs inline.

**What it does, repeated until done or blocked:**

1. Runs `node $CLAUDE_PLUGIN_ROOT/scripts/ticket-queue.js`, which lists every ticket in `02-plan/tickets/` and, for each, checks its `03-implement/NN-<slug>/commit-log.md`: a ticket counts as done only if that file's Status line is exactly `**Status:** ✅ Done` (the template starts as `In Progress`; older sessions' raw `In Progress / ✅ Done` also doesn't count). Returns the full list in ticket-number order plus `nextPending`, the first ticket that isn't done. Files not named `NN-<slug>.md` are skipped with a warning. It fails if the grill or plan phase isn't written yet.
2. **If `nextPending` is null:** every ticket is done — report that and suggest `/gps finish`. Stop.
3. **Otherwise**, for `nextPending`:
   - Run `node $CLAUDE_PLUGIN_ROOT/scripts/ticket.js <N>` (same as `/gps ticket <N>`) to scaffold the workspace and print the spec, the scratch dir, and the token-usage phase key (`03-<NN>-<slug>`).
   - **Inline mode:** implement it yourself the normal way — write the code, debug and fix issues as they come up, that's just development, not a "blocker." Run and test artifacts (build/run logs, output files) go under the session's scratch dir printed by `ticket.js`, never in the repo root or source tree. Run the ticket's Verification Step command from its spec.
     - **On success:** run `node $CLAUDE_PLUGIN_ROOT/scripts/token-usage.js 03-<NN>-<slug>` to get this ticket's token usage, then fill in `commit-log.md` (Status: `✅ Done`, the commit(s), test output, review notes, time spent, Token Usage — `unavailable` per line if the script returned `available: false`). Then run `node $CLAUDE_PLUGIN_ROOT/scripts/ticket-done.js <N>` (`<N>` is the ticket number): it records when the ticket was completed in the session history and refuses unless the Status line says `✅ Done`. Stage only the files this ticket touched (never `git add -A`) and commit them with a message referencing the ticket.
     - **On genuine failure** (verification won't pass after reasonable attempts, or the ticket needs information only the user can provide): leave `commit-log.md` as `**Status:** In Progress` with a filled-in Blockers/Challenges section explaining what's wrong. Do not commit. Stop the whole `/gps ship` loop here and report to the user which ticket and why.
   - **Subagent mode:** dispatch one `general-purpose` subagent (Agent tool, no model override — it inherits the session's default model; no worktree isolation — the same working tree is safe here because dispatch is strictly sequential: this ticket reaches a terminal state, committed or blocked, before the next ticket's subagent is ever dispatched). Never have two implementer subagents live at once. Give the dispatch prompt:
     - The ticket's full `ticketPath` value as already returned by `ticket-queue.js` for this ticket — to read as its complete spec — not a hand-assembled `02-plan/tickets/NN-<slug>.md` fragment; don't paste the ticket's text into the dispatch.
     - The `commitLogPath` and scratch dir exactly as printed by `ticket.js` in this same step — not re-derived or abbreviated — plus the phase key (`03-<NN>-<slug>`).
     - An orientation instruction: check `git log --oneline` for commits made since this session started, and read the files the ticket names, before assuming anything about what a previous ticket did — a previous ticket's subagent shares no memory with this one, so the ticket's own text (Acceptance Criteria, Files to Touch, Notes) and the current repo state are the only things it can rely on.
     - The same on-success and on-failure contract as inline mode above: on success, run the exact command line with `$CLAUDE_PLUGIN_ROOT` and the phase key already substituted — e.g. `node $CLAUDE_PLUGIN_ROOT/scripts/token-usage.js 03-<NN>-<slug>` with `<NN>-<slug>` filled in for this ticket, the same way the Inline mode bullet spells it out — then fill in `commit-log.md`, run `node $CLAUDE_PLUGIN_ROOT/scripts/ticket-done.js <N>` with the ticket number filled in, stage only touched files, commit referencing the ticket; on failure, leave `commit-log.md` as `In Progress` with Blockers/Challenges filled in and make no commit. No separate review subagent — the implementer verifies and commits itself, same as inline mode.
     - An explicit instruction that the subagent does this ticket's work itself and never dispatches subagents of its own — no helpers, no self-review-then-second-opinion, nothing — so only one implementer is ever live on the working tree.
     - A required terminal report: **DONE** with commit SHA(s) and a one-line test summary, or **BLOCKED** with a one-line reason.
     Wait for that report before doing anything else. On **DONE**, treat the ticket as complete — the subagent already filled `commit-log.md` and committed, so don't repeat those steps. If the next `ticket-queue.js` run (step 1) still returns this same ticket as `nextPending` after a DONE report, that DONE was inaccurate — stop the whole `/gps ship` run and report it to the user, rather than dispatching another subagent at it. On **BLOCKED**, stop the whole `/gps ship` loop and report to the user which ticket and why, exactly as inline mode's on-failure step does — no automatic retry, no second subagent.
4. Go back to step 1 and repeat, until `nextPending` is null or step 3 stops the loop on a failure.

**Output:** Every ticket implemented and committed, one commit per ticket — or a clear report of which ticket blocked the run and why.

**Example:**

```
/gps ship
```
