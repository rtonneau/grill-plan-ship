# 0011: A full /gps ship chains a finish that asks nothing

## Context

When `/gps ship` completed the last ticket, it suggested `/gps finish` and stopped, so every session needed one more typed command. Under `/gps auto`, finish still asked its closing questions (close issue #N? switch to an unfinished session?), which blocked an unattended run. The rule until then was that typing `/gps finish` is the go-ahead for its push and pull request.

## Decision

- `ship.autoFinish` (boolean, default `true`, hand-edited in `.work/gps-config.json`, shown by `/gps config`) makes typing a full `/gps ship` the go-ahead for finish too. When the loop reaches "All tickets are done", including when every ticket was done before it started, ship runs `references/finish.md` as a chained finish. `false` restores the old suggestion.
- `/gps ship N` never chains: it implements one ticket and still only suggests `/gps finish`. A BLOCKED ticket, a failed `ticket-check.js` or any `❌` stops the run before finish.
- A chained finish (from ship, or from `/gps auto` with any target) asks nothing: it answers the issue question with `--keep-issue` and offers no session switch. A typed `/gps finish` still asks both questions.
- `auto-route.js ship` lists finish after ship when the setting is on, and stops at ship when it is off.

## Alternatives rejected

- A per-run flag or a question at ship start: one more thing to type or answer on every ship, for a choice that rarely changes within a project.
- Chaining from `/gps ship N`: running one ticket is a deliberate partial step, often to inspect the result before going on.
- Asking the closing questions in a chained finish: the run would stop at the end of an otherwise unattended ship.
- Closing the issue by default: an unattended run should not decide that the reported problem is solved; a planned session's PR already says `Closes #N`, which closes it on merge.

## Consequences

Typing `/gps ship` on a GitHub project can now push the branch and open the pull request without a second command. Users who want to review the finished tickets before that set `ship.autoFinish` to `false`, or run `/gps ship N`. A chained finish never closes an issue and never switches session: close the issue in the PR or by hand, and pick the next session with `/gps status`.
