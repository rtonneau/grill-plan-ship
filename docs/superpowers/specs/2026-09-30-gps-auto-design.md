# /gps auto: unattended run through the remaining phases

## Problem Statement

A gps session stops for the user at every phase boundary: after the grill write, after writing-plans drafts the tickets, at ship's mode and model-hint questions, and at finish. `/gps write+plan` and `/gps write+ship` remove one stop each. When the user already trusts the direction, they want one command that carries the session from its current phase to a chosen end point without further input.

## Context & Constraints

- `scripts/lib/write-target.js` (`resolveWriteTarget`) already detects the session's phase: `grill` (resume pending), `none/plan-not-started` (resume written, no plan), `plan` (plan stub, tickets pending), `none/complete` (plan written).
- `finish.js` treats "resume written, no plan" as a bounded session (no tickets, no branch, no PR).
- `write.md` defines the chaining pattern: run a step, relay its `✅` (and `🌿`) line but not its `Next:` suggestion, then read the next command's reference file and run it as if typed.
- `/gps write` is transcription: it can only save content agreed or drafted in the current conversation.
- `ship.md` asks the ship mode every run, and in subagent modes asks to confirm model hints.
- `finish.md` pushes and opens a PR with no confirmation on GitHub sessions, asks "Close issue #N?" on bounded issue sessions, and asks whether to switch to an unfinished session.
- Project conventions: handlers use Node's `fs` only, print `✅`/`❌` feedback, record state changes with `recordEvent`, and routing logic lives in tested code rather than prose.

## Success Metrics

- `/gps auto` (target `finish`) takes a session whose grill design was approved in the conversation through write, plan, write, ship and finish, asking questions only once, at the start.
- `/gps auto plan` and `/gps auto ship` stop after the plan is written and after ship, respectively.
- `/gps write+finish` behaves exactly like `/gps auto finish`. `/gps write+plan` and `/gps write+ship` are unchanged.
- Any failure (handler `❌`, BLOCKED ticket, inaccurate DONE) ends the run at that step; finish never runs after an incomplete ship.
- INDEX.md's Timeline (and so the PR) shows the session ran under `/gps auto` with automatically approved tickets.

## Architecture & Approach

### Routing: `scripts/lib/auto-route.js` (new)

`computeRoute(sessionDir, config, target)` returns `{ target, steps, questions }` or throws a `GpsError`.

`target` is `plan`, `ship` or `finish` (default `finish`). Any other value fails with the list of valid targets.

Full step order: `write:grill`, `plan`, `write:plan`, `ship`, `finish`. The route starts at the step matching the session's phase and ends at the target's last step:

| Phase (`resolveWriteTarget`) | First step |
|---|---|
| `grill` | `write:grill` |
| `none` / `plan-not-started` | `plan` |
| `plan` | `write:plan` |
| `none` / `complete` | `ship` |

Target end steps: `plan` → `write:plan`, `ship` → `ship`, `finish` → `finish`.

If the target's end step comes before the first step (e.g. `auto plan` on a session whose plan is written), fail: `❌ Target "plan" is already done.` with a hint naming the targets still reachable. A finished session fails as other handlers do.

`questions` lists what the route needs asked up front: `ship-mode` when `ship` is in the steps. No `close-issue` question: `auto` always plans, so a GitHub issue session always gets a branch, and its PR closes the issue.

Bounded sessions: `auto` always plans. A user who wants bounded work runs `/gps finish` directly.

### Handler: `scripts/auto-route.js` (new)

`node $CLAUDE_PLUGIN_ROOT/scripts/auto-route.js [target]`

Resolves the current session, calls `computeRoute`, records an `auto_started` event (`detail`: target and steps) with `recordEvent`, and prints the result as JSON. Fails with the usual `❌` line plus hint.

### Instructions: `skills/gps/references/auto.md` (new)

1. Run the handler. On `❌`, relay and stop.
2. If the first step is `write:grill` or `write:plan`, check the content exists in this conversation (an approved grill design, or drafted tickets). If not, stop: `/gps write` would have nothing to transcribe. Suggest finishing the grill, or `/gps plan`'s drafting, first.
3. If `questions` lists `ship-mode`, ask it in one `AskUserQuestion` call: subagent, inline, or subagent + inline follow-up.
4. Run each step in order by reading its reference file and running it as if typed, with these overrides:
   - `write:grill` / `write:plan`: `write.md` steps 1–3, including its payload-fix recovery.
   - `plan`: skip waiting for ticket approval and skip writing-plans' own execution hand-off question; the drafted tickets are approved.
   - `ship`: use the collected mode; take model hints as drafted, no confirmation prompt.
   - `finish`: run as typed. Its closing "switch to an unfinished session?" question is still asked.
5. Relay each step's `✅`, `🌿` and `🔀` lines, never its `Next:` suggestion. Stop the run at the first failure and report which step stopped it.

### Edits to existing files

- `skills/gps/SKILL.md`: add `/gps auto [plan|ship|finish]` to the command list and the description; route `/gps auto` and `/gps write+finish` to `references/auto.md`.
- `skills/gps/references/write.md`: add `write+finish` to the chained forms, routed to `auto.md` as `auto finish`. Any other `+` form stops and lists the three.
- `skills/gps/references/ship.md`: one line — under `/gps auto`, mode and model hints come from the run, so ship asks nothing.
- `skills/gps/references/plan.md`, `start.md`: mention `/gps auto` in the "Next:" lines.
- `README.md`, `CLAUDE.md`: list the command and the handler.
- `scripts/handlers.test.js`: `auto` has a references file with its handler line.

## Error Handling

- Handler: invalid target, target already done, no current session, finished session → `❌` + hint, exit non-zero, nothing recorded.
- During the run: each step keeps its own failure rules. The only in-run recovery is `write.md`'s "fix the payload and run write-apply again". A BLOCKED ticket or inaccurate DONE ends the run before finish.

## Testing

- `scripts/lib/auto-route.test.js`: each phase × each target; invalid target; target already done; `questions` for routes with and without `ship`.
- `scripts/handlers.test.js`: references check for `auto`.
- Manual: reinstall the plugin, then run `/gps auto` end to end on a throwaway session in a scratch repo (the installed plugin, not this working tree, is what `/gps` runs).

## Out of Scope

- Flags to pre-answer questions (`--mode`, `--close-issue`).
- A checkpoint for reviewing tickets mid-run.
- Starting from before an approved grill design (auto does not brainstorm).
- Arbitrary explicit chains (`w+p+w+s+f`) and single-letter aliases.
