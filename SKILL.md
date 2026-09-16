# grill-plan-ship

Universal workflow plugin: brainstorm → plan → implement.

**Commands:**

- `/gps start <feature-name>` — Begin a new feature
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

This skill composes the following superpowers and tools:

- **brainstorming** (superpowers) — Initial ideation and spec clarification during grill phase
- **writing-plans** (superpowers) — Generate implementation tasks from clarified spec during plan phase
- **unslop** — Polish and crisp up generated ticket language for clarity

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

**Output:** Ready to brainstorm.

**Example:**

```
/gps start add-dark-mode
```

---

### /gps plan

**When:** After reviewing the grill session (resume.md approved).

**What it does:**

1. Resolves the current session via `.work/sessions/.current-session`, then reads its `01-grill/resume.md` (fails if it still contains unfilled `{{ ... }}` placeholders)
2. Creates `02-plan/` directory
3. Creates `02-plan/plan.md` template
4. Creates 4 ticket templates in `02-plan/tickets/`

**Output:** Ticket templates ready for you to fill in.

**Next:** Run `/writing-plans` to generate actual tickets. Run `/unslop` on each ticket.

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

This plugin orchestrates a workflow using:

- `brainstorming` (superpowers)
- `writing-plans` (superpowers)
- `unslop` (for crisp language)

---

## Installation

```powershell
gh repo clone yourusername/grill-plan-ship $HOME\.claude\skills\grill-plan-ship
```

## Restart Claude Code

Then in any project:

```
/gps start your-feature-name
```
