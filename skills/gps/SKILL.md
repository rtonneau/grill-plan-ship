---
name: gps
description: "grill-plan-ship: universal workflow plugin (brainstorm → plan → implement). Use for /gps start, /gps write, /gps plan, /gps ticket, /gps finish."
---

# grill-plan-ship

Universal workflow plugin: brainstorm → plan → implement.

**Commands:**

- `/gps start <feature-name>` — Begin a new feature
- `/gps write` — Write the current phase's output (brainstorm resume, or plan + tickets) to disk
- `/gps plan` — Generate plan + tickets
- `/gps ticket <number>` — Implement ticket N
- `/gps finish` — Archive session + summary

---

## Overview

This plugin orchestrates a repeatable, documented workflow for any code project:

1. **Grill** (Session 1) — Brainstorm, clarify spec
2. **Plan** (Session 2) — Break work into atomic tickets
3. **Ship** (Session 3+) — Implement tickets one by one
4. **Finish** — Archive and summarize

All output lives in `.work/sessions/YYYY-MM-DD__<feature>/` with a standard structure.

---

## Dependencies

`/gps` invokes these automatically as part of its own commands — you never run them yourself:

- **brainstorming** (superpowers) — invoked by `/gps start` for ideation and spec clarification
- **writing-plans** (superpowers) — invoked by `/gps plan` to turn the approved resume into tickets
- **unslop** — invoked by `/gps plan` on each generated ticket for crisp language

---

## Commands

### /gps start <feature-name>

**When:** Beginning a new feature.

**What it does:**

1. Creates session directory: `.work/sessions/YYYY-MM-DD__<feature-name>/`
2. Creates `.work/sessions/YYYY-MM-DD__<feature-name>/.session-config.json`
3. Creates `.work/sessions/YYYY-MM-DD__<feature-name>/01-grill/` directory
4. Creates empty `resume.md` and `notes.md` templates
5. Writes `.work/sessions/.current-session` pointing at this session, so later commands operate on it regardless of what other sessions exist
6. Immediately invokes the `brainstorming` skill for this feature to begin the grill conversation — do not wait for or ask the user to run `/brainstorming` themselves

**Output:** The grill conversation begins right away.

**Next:** Once the brainstorming design is approved, run `/gps write` to save the resume, then `/gps plan`.

**Example:**

```
/gps start add-dark-mode
```

---

### /gps write

**When:** After the brainstorming conversation `/gps start` began has been approved (before `/gps plan`), or after the writing-plans conversation `/gps plan` began has been approved (before `/gps ticket`). Takes no arguments — it detects which phase needs writing.

**What it does:**

1. Runs `node $CLAUDE_PLUGIN_ROOT/scripts/write-target.js`, which resolves the current session and inspects its files for unfilled `{{ ... }}` template placeholders to decide what's pending:
   - `01-grill/resume.md` still has placeholders → **grill** phase is pending.
   - Otherwise, if `02-plan/plan.md` doesn't exist yet → nothing to write; run `/gps plan` first.
   - Otherwise, if `02-plan/plan.md` or any ticket file still has placeholders → **plan** phase is pending.
   - Otherwise → nothing pending.
2. **If grill is pending:** Claude Code synthesizes the brainstorming conversation into `01-grill/resume.md`, filling in every template section (Problem Statement, Context & Constraints, Success Metrics, Architecture & Approach, Assumptions & Trade-offs, Open Questions, Notes) — leaving no `{{ ... }}` placeholders.
3. **If plan is pending:** Claude Code synthesizes the most recent writing-plans output into `02-plan/plan.md`, then replaces the placeholder ticket stubs in `02-plan/tickets/` with one real `NN-<slug>.md` file per actual ticket (the ticket count is whatever writing-plans produced, not fixed at 4). It then runs `node $CLAUDE_PLUGIN_ROOT/scripts/mark-plan-written.js` to record the plan phase as complete.
4. **If nothing is pending:** reports that and suggests the next command (`/gps plan`, `/gps ticket <N>`, or `/gps finish`).

**Output:** The pending phase's files written to disk with real content, ready for the next command.

**Example:**

```
/gps write
```

---

### /gps plan

**When:** After reviewing the grill session (resume.md approved).

**What it does:**

1. Resolves the current session via `.work/sessions/.current-session`, then reads its `01-grill/resume.md` (fails if it still contains unfilled `{{ ... }}` placeholders)
2. Creates `02-plan/` directory
3. Creates `02-plan/plan.md` template
4. Creates 4 ticket templates in `02-plan/tickets/`
5. Immediately invokes the `writing-plans` skill against the approved `resume.md` to generate the actual tickets, then invokes `unslop` on each resulting ticket — do not wait for or ask the user to run these themselves

**Output:** The writing-plans conversation begins right away.

**Next:** Once the tickets are approved, run `/gps write` to save the plan and tickets to disk.

---

### /gps ticket <number>

**When:** Starting implementation of a ticket.

**What it does:**

1. Reads `02-plan/tickets/NN-*.md`
2. Creates `03-implement/NN-slug/` directory
3. Creates `commit-log.md` template
4. Prints ticket spec to console

**Output:** Workspace + spec printed. Ready to code.

---

### /gps finish

**When:** All tickets complete.

**What it does:**

1. Generates `INDEX.md` (session summary)
2. Updates `.session-config.json` with "completed" status
3. Prints summary

**Output:** Archived session, ready to start next feature.

---

## Composable Skills

`/gps` commands invoke these automatically — you never run them directly:

- `brainstorming` (superpowers) — invoked by `/gps start`
- `writing-plans` (superpowers) — invoked by `/gps plan`
- `unslop` — invoked by `/gps plan`, after writing-plans, for crisp language

---

## Installation

```
/plugin marketplace add rtonneau/grill-plan-ship
/plugin install grill-plan-ship
```

## Restart Claude Code

Then in any project:

```
/gps start your-feature-name
```
