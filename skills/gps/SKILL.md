---
name: gps
description: "grill-plan-ship: universal workflow plugin (brainstorm → plan → implement). Use for /gps scout, /gps scout --from, /gps start, /gps issue, /gps status, /gps write, /gps plan, /gps ticket, /gps ship, /gps finish, /gps handoff, /gps resume."
---

# grill-plan-ship

Universal workflow plugin: brainstorm → plan → implement.

## How to run a command

Each command's full instructions live in `references/<command>.md` in this skill's directory (`/gps write` → `references/write.md`; `/gps scout --from …` → `references/scout.md`). Before doing anything else, read the file for the command you were given, and only that file. Never run a command from memory of an earlier read.

## Commands

- `/gps scout [--from <review-file>] [direction]` — Scan the codebase for architecture candidates, or read an existing review, and turn the result into ready-to-use `/gps start` seeds
- `/gps start <feature-name>` — Begin a new feature
- `/gps issue <title>` — Report a problem as a GitHub issue (local session without GitHub) and work on it
- `/gps status` — Show every session's state, scouted ideas not started yet, and what's pending on the current one
- `/gps write` — Write the current phase's output (brainstorm resume, or plan + tickets) to disk
- `/gps plan` — Generate plan + tickets
- `/gps ticket <number>` — Implement ticket N
- `/gps ship` — Implement every remaining ticket in order, one commit each
- `/gps finish` — Close the session and write its summary
- `/gps handoff` — Save an in-flight checkpoint of the current session before stopping work
- `/gps resume` — Catch up on the current session using its saved handoff plus live state

## Workflow

Grill (brainstorm, clarify the spec) → Plan (atomic tickets) → Ship (implement tickets one by one) → Finish (close and summarize). An optional `/gps scout` sources feature candidates before Grill. On GitHub projects (flag in `.work/gps-config.json`), saving the plan creates the session's branch and `/gps finish` opens its pull request; bounded work gets neither, and `/gps issue` files a GitHub issue at the grill write.

All output lives in `.work/sessions/YYYY-MM-DD__<slug>/` (local date; `<slug>` is the feature name cleaned to lowercase `a-z 0-9 . _ -`).

## Rules for every command

- Every command runs its handler script with the exact `node $CLAUDE_PLUGIN_ROOT/scripts/<name>.js` line given in its references file. **Never create, edit or delete session state by hand** (`.session-config.json`, `.current-session`, `.pending-seeds.json`, directories) to stand in for a handler.
- If a handler exits non-zero, it prints `❌ <what failed>` and a recovery hint on the next line. Show both to the user and stop that command — do not retry with different arguments or work around it, unless its references file says how to recover (e.g. `/gps write` payload errors).
- Handlers never overwrite existing work: re-running `/gps start`, `/gps issue`, `/gps plan`, `/gps ticket` or `/gps finish` against existing output either refuses (changing nothing) or resumes, as described per command.

## Switching the current session (internal, no `/gps` command)

`node $CLAUDE_PLUGIN_ROOT/scripts/set-current.js <session-id>` points `.work/sessions/.current-session` at an existing, unfinished session. Run it **only after the user confirms** a switch — after `/gps finish`, or when a handler reports that the current session can't be resolved.
