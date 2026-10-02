---
name: gps
description: "grill-plan-ship: workflow plugin (grill → plan → ship → finish). Use for /gps scout, /gps start, /gps status, /gps clean, /gps config, /gps write, /gps plan, /gps ship, /gps finish, /gps auto, /gps handoff."
---

# grill-plan-ship

Grill (spec the work) → Plan (atomic tickets) → Ship (one commit per ticket) → Finish (summary, and a PR on GitHub projects). Each session lives in `.work/sessions/YYYY-MM-DD__<slug>/`; the scripts own every file there.

## Commands

| Command | What it does | Instructions |
|---|---|---|
| `/gps scout [--from <review-file>] [direction]` | Turn an architecture review, or an existing review file, into ideas for `/gps start` | `references/scout.md` |
| `/gps start [--issue] <name>` | New session, then the grill (`--issue`: a report, filed as a GitHub issue) | `references/start.md` |
| `/gps status` | Sessions, ideas, current phase and handoff, next command | `references/status.md` |
| `/gps clean [id...]` | Delete sessions or drop ideas, after confirmation | `references/clean.md` |
| `/gps config [--rescan]` | Show or re-detect the project's GitHub flag | `references/config.md` |
| `/gps write` | Save the approved grill or plan to disk | `references/write.md` |
| `/gps plan` | Save the grill if pending, start the plan, draft tickets | `references/plan.md` |
| `/gps ship [N]` | Save the plan if pending, implement every remaining ticket (or only ticket N) | `references/ship.md` |
| `/gps finish` | Close the session: leftovers committed, INDEX.md, PR | `references/finish.md` |
| `/gps auto [--delegate] [plan\|ship\|finish]` | Run from the current phase to the target without stopping | `references/auto.md` |
| `/gps handoff` | Save an in-flight checkpoint (HANDOFF.md) | `references/handoff.md` |

## How to run a command

Read the command's references file (in this skill's directory) before doing anything else, every time; never run a command from memory. In those files, `<name>.js` means `node $CLAUDE_PLUGIN_ROOT/skills/gps/scripts/<name>.js`. Every deterministic step is a script: run it rather than doing its work by hand.

## Script contract

- **stdout** is text to relay to the user as is; with `--json` it is one JSON object instead.
- **`⚠️` lines** (stderr) are warnings: relay them; they never stop a command.
- **Exit 1** prints `❌ <what failed>` and a hint; **exit 2** is a usage error. Show both and stop the command. Don't retry with other arguments or work around it, unless the references file says how to recover.
- **`Next:` lines** name the command to run next. Follow them unless the references file says otherwise (e.g. under `/gps auto`).

## Rules for every command

- Never create, edit or delete session state by hand (`.session-config.json`, `.current-session`, `.pending-seeds.json`, session directories). Claude writes only the narrative a script points at: the write payload, a commit log's narrative sections, HANDOFF.md.
- Scripts never overwrite work: re-running a command against existing output refuses (changing nothing) or resumes.
- While a grill skill runs (`grill-with-docs`, `grilling`, `domain-modeling`, `brainstorming`), ask every question with a finite set of answers with `AskUserQuestion`, one question per call, recommended answer first and marked "(Recommended)". This overrides a skill's own "ask in chat".
- Switch the current session only after the user confirms it: `set-current.js <session-id>`.
- On GitHub projects (flag in `.work/gps-config.json`), saving the plan creates the session branch and `/gps finish` opens its pull request; bounded work (no plan) gets neither.
