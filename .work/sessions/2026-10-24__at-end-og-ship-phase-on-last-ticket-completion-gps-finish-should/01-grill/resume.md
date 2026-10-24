# Session: At end og ship phase, on last ticket completion, '/gps finish' should be called automatically

**Date:** 2026-10-24T06:45:17.008Z
**Status:** Grill phase complete

## Problem Statement

When `/gps ship` completes the last ticket, it only suggests `/gps finish` and stops, so the user must type it. A full ship run should chain into `/gps finish` automatically.

## Context & Constraints

- **Current behavior:** `references/ship.md`: when `ticket-start.js` reports "All tickets are done", suggest `/gps finish` and stop (under `/gps auto`, return to auto.md). `/gps auto` runs finish but still asks its closing questions (close issue #N? switch to an unfinished session?).
- **Pain point:** an extra manual step after every ship; finish's closing questions block an unattended run.
- **Dependencies:** finish keeps its judgment steps (changelog bullets, PR title), so the chain is a reference handoff, not a script call. `finish.js --keep-issue` already exists. Settings follow the `scratch.*` pattern: hand-edited in `.work/gps-config.json`, validated in `lib/project-config.js` with defaults on read, shown read-only by `config.js`.
- **Tech stack:** Node.js built-ins only; skill references in markdown; `node --test`.

## Success Metrics

- A full `/gps ship` (not `/gps ship N`) that reaches "All tickets are done" — including when every ticket was already done at start — runs `/gps finish` when `ship.autoFinish` is on (default true); a BLOCKED ticket, failed `ticket-check` or any `❌` still stops before finish.
- `ship.autoFinish` is validated (boolean) by `lib/project-config.js`, defaults to true on read, and is shown by `/gps config`.
- A chained finish (from ship, or from `/gps auto` with any target) asks nothing: it passes `--keep-issue` and offers no session switch; a typed `/gps finish` still asks both questions.
- `auto-route.js ship` lists finish after ship when `ship.autoFinish` is on, and stops at ship when it is off.
- `docs/decisions/0009-ship-chains-finish.md` records the decision and CLAUDE.md's decisions line names it; `npm test` passes.

## Architecture & Approach

- `lib/project-config.js`: validate `ship.autoFinish` (boolean) and add `shipSettings(projectRoot)` returning `{ autoFinish }` with default true; `config.js` shows it read-only.
- `auto-route.js`: for target `ship`, append the finish step when `ship.autoFinish` is on.
- `references/ship.md`: the loop's "All tickets are done" branch runs `references/finish.md` as a chained finish when the setting is on (full ship only; `ship N` still suggests it), else suggests `/gps finish` as today. The script's Next lines (`ticket-start.js`, `ticket-queue.js`, `ticket-complete.js`) stay accurate.
- `references/finish.md`: a chained-finish rule: ask nothing, pass `--keep-issue`, skip the session-switch question. `references/auto.md`: finish's closing questions are no longer asked.
- `docs/decisions/0009-ship-chains-finish.md` plus the CLAUDE.md decisions line; tests for project-config, config, auto-route and the skill checks.

## Assumptions & Trade-offs

- Typing a full `/gps ship` now counts as the go-ahead for finish (push and PR) when the setting is on; this reverses "typing /gps finish is the go-ahead", hence decision 0009.
- Chained finish keeps the issue open and never switches session; users who want to close the issue do it in the PR or by hand.
- Not doing: a per-run flag or a question at ship start; chaining from `/gps ship N`; a `/gps config` command to toggle the setting (hand edit, like `scratch.*`).

## Open Questions

None.

## Notes

Glossary term added: **Chained finish** (`.work/GLOSSARY.md`).
