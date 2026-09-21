---
name: gps
description: "grill-plan-ship: universal workflow plugin (brainstorm → plan → implement). Use for /gps scout, /gps start, /gps status, /gps write, /gps plan, /gps ticket, /gps ship, /gps finish."
---

# grill-plan-ship

Universal workflow plugin: brainstorm → plan → implement.

**Commands:**

- `/gps scout [direction]` — Scan the codebase for architecture candidates and turn them into ready-to-use `/gps start` seeds
- `/gps start <feature-name>` — Begin a new feature
- `/gps status` — Show every session's state and what's pending on the current one
- `/gps write` — Write the current phase's output (brainstorm resume, or plan + tickets) to disk
- `/gps plan` — Generate plan + tickets
- `/gps ticket <number>` — Implement ticket N
- `/gps ship` — Implement every remaining ticket in order, one commit each
- `/gps finish` — Archive session + summary

---

## Overview

This plugin orchestrates a repeatable, documented workflow for any code project:

1. **Grill** (Session 1) — Brainstorm, clarify spec
2. **Plan** (Session 2) — Break work into atomic tickets
3. **Ship** (Session 3+) — Implement tickets one by one
4. **Finish** — Archive and summarize

An optional `/gps scout` step can run before Grill to source feature candidates from an architecture review, instead of starting `/gps start` from a blank idea.

All output lives in `.work/sessions/YYYY-MM-DD__<feature>/` with a standard structure.

---

## Dependencies

`/gps` invokes these automatically as part of its own commands — you never run them yourself:

- **improve-codebase-architecture** (mattpocock-skills) — invoked by `/gps scout` to scan the codebase and produce the candidate report
- **brainstorming** (superpowers) — invoked by `/gps start` for ideation and spec clarification
- **writing-plans** (superpowers) — invoked by `/gps plan` to turn the approved resume into tickets
- **unslop** — invoked by `/gps plan` on each generated ticket for crisp language

---

## Commands

### /gps scout [direction]

**When:** Before you know what feature to build — you want the codebase itself to suggest candidates.

**What it does:**

1. Calls the Skill tool with `improve-codebase-architecture`, passing `[direction]` through verbatim as its prompt argument (e.g. `only review sim.cc`). Omit `[direction]` to let that skill infer hot spots from git history instead.
2. Follows that skill's own process for its steps 1 (Explore) and 2 (Present candidates as an HTML report) exactly as written — the same self-contained HTML report gets written to the OS temp dir and opened for you.
3. Does **not** proceed to that skill's step 3 (the grilling loop). Instead, for every candidate card in the report, Claude Code synthesizes a seed entry: `slug` (lowercase kebab-case, no spaces — this becomes the `/gps start` argument), `strength`, `files`, `problem`, `solution`, `benefits`.
4. Writes those candidates to a temp JSON file and runs `node $CLAUDE_PLUGIN_ROOT/scripts/scout-merge.js <tempReportPath> <entriesJsonPath>`, which:
   - Copies the HTML report, unmodified, into `.work/sessions/scout-reports/architecture-review-<timestamp>.html` — this copy is write-once and is never edited or deleted by any later `/gps` command.
   - Merges the seed entries into `.work/sessions/.pending-seeds.json`, keyed by slug (a slug that already exists there gets overwritten with the fresh version; other slugs are untouched).
   - Prints a JSON summary of what was seeded.
5. Claude Code presents that summary in chat: each candidate's slug, strength badge, one-line problem, and an explicit `/gps start <slug>` line to copy.

**Output:** The HTML report (temp + a permanent copy under `.work/sessions/scout-reports/`), plus a chat list of ready-to-run `/gps start <slug>` commands.

**Next:** Run `/gps start <slug>` for whichever candidate you want to pursue — if a seed matches, brainstorming opens already seeded with that candidate's problem/solution/files instead of starting from zero.

**Example:**

```
/gps scout only review sim.cc
```

---

### /gps start <feature-name>

**When:** Beginning a new feature.

**What it does:**

1. Creates session directory: `.work/sessions/YYYY-MM-DD__<feature-name>/`
2. Creates `.work/sessions/YYYY-MM-DD__<feature-name>/.session-config.json`, recording `scratch_dir`
   Also creates the session's scratch directory `.scratch/tests/YYYY-MM-DD__<feature-name>/` (for build/run/test artifacts) and appends `.scratch/` to the project's `.gitignore` if missing.
3. Creates `.work/sessions/YYYY-MM-DD__<feature-name>/01-grill/` directory
4. Creates empty `resume.md` and `notes.md` templates
5. Writes `.work/sessions/.current-session` pointing at this session, so later commands operate on it regardless of what other sessions exist
6. Looks up `.work/sessions/.pending-seeds.json` for an entry whose slug matches this feature-name (e.g. `/gps start runconfig-resolver` matches a seed keyed `runconfig-resolver`, written earlier by `/gps scout`). If found, removes that entry from the seeds file — consumed seeds don't linger — and carries its `problem`/`solution`/`files`/`sourceReport` forward as the starting context for brainstorming. If no match, brainstorming starts from zero as it always has.
7. Immediately invokes the `brainstorming` skill for this feature to begin the grill conversation — do not wait for or ask the user to run `/brainstorming` themselves. If a seed was found in step 6, open with that context already summarized rather than asking the user to restate it.

**If brainstorming classifies the work as "bounded"** (a short in-chat design instead of a full spec/plan doc):

- Presenting the design and getting a "yes" are two different steps. Answering an open design question (e.g. "macro file first or order-independent?") is **not** approval to implement. The agent must ask a standalone, unambiguous question — e.g. *"Ready for me to implement this?"* — and wait for an explicit yes before writing any code.
- Once approved, and **before touching any code**, the agent must synthesize and save `01-grill/resume.md` using the same full-template process `/gps write` performs (all 7 sections) — every grill phase leaves a trace on disk, bounded or not.
- No `02-plan/plan.md`, no tickets: bounded work skips straight from the saved resume to implementation via the normal dev workflow. Run `/gps finish` when done.

**Output:** The grill conversation begins right away.

**Next:** Once the brainstorming design is approved, run `/gps write` to save the resume, then `/gps plan`.

**Example:**

```
/gps start add-dark-mode
```

---

### /gps status

**When:** Reorienting after returning to a project, losing context, switching machines, or any time you need a "where did I leave off?" answer. Takes no arguments. Read-only — it never writes or modifies any session file.

**What it does:**

1. Runs `node $CLAUDE_PLUGIN_ROOT/scripts/status.js`, which:
   - Lists every session under `.work/sessions/` with its feature name, creation date, status, and completed phases.
   - Resolves the current session (same logic as every other command) and, for it only, adds:
     - `writeTarget` — whether `/gps write` has something pending (`grill`, `plan`, or `none`), same detection `/gps write` itself uses.
     - `tickets` / `nextPending` — the ticket queue, same detection `/gps ship` itself uses.
     - `gitLog` — the last 5 commits (oneline) touching that session's directory, so recent implementation activity is visible even without opening `commit-log.md` files.
2. Claude Code renders that JSON as a short human-readable report:
   - One line per session: feature name, status, phases completed.
   - For the current session: which phase is pending and why, ticket progress (`X/Y done`, next pending ticket if any), and the recent commits.
   - Ends with an explicit suggested next command, using the same phase logic `/gps write` and `/gps ship` already use: grill pending → `/gps write`; plan not started → `/gps plan`; plan pending write → `/gps write`; tickets pending → `/gps ship` (or `/gps ticket <N>`); everything done → `/gps finish`.

**Output:** A status report printed in chat. No files are created or changed.

**Example:**

```
/gps status
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
   - When a phase is pending, it also computes that phase's real token usage (parsed from Claude Code's own session transcripts) and includes it as `tokenUsage` in its JSON output — either `{ available: true, input, output, cacheRead, cacheCreation, total }` or `{ available: false }`.
2. **If grill is pending:** Claude Code synthesizes the brainstorming conversation into `01-grill/resume.md`, filling in every template section (Problem Statement, Context & Constraints, Success Metrics, Architecture & Approach, Assumptions & Trade-offs, Open Questions, Notes, Token Usage) — leaving no `{{ ... }}` placeholders. For Token Usage, use the `tokenUsage` values from step 1's output verbatim; if `available` is `false`, write `unavailable` for each line instead of a number.
3. **If plan is pending:** Claude Code synthesizes the most recent writing-plans output into `02-plan/plan.md` (including its Token Usage section, filled the same way as grill's), then replaces the placeholder ticket stubs in `02-plan/tickets/` with one real `NN-<slug>.md` file per actual ticket (the ticket count is whatever writing-plans produced, not fixed at 4). It then runs `node $CLAUDE_PLUGIN_ROOT/scripts/mark-plan-written.js` to record the plan phase as complete.
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

**Next:** Once the tickets are approved, run `/gps write` to save the plan and tickets to disk, then `/gps ship` to implement them.

---

### /gps ticket <number>

**When:** Starting implementation of a single ticket by hand. To implement every remaining ticket in one go, use `/gps ship` instead.

**What it does:**

1. Reads `02-plan/tickets/NN-*.md`
2. Creates `03-implement/NN-slug/` directory
3. Creates `commit-log.md` template
4. Records this ticket's token-usage phase key (`03-NN-<slug>`) in `.session-config.json`, so usage can be computed later when the ticket is finalized
5. Prints ticket spec to console, including that phase key and the session's scratch dir (backfilled for sessions started before scratch dirs existed)

**Output:** Workspace + spec printed. Ready to code.

---

### /gps ship

**When:** After tickets have been saved to disk (`/gps write` has run for the plan phase). Takes no arguments — it works through whatever tickets remain.

**What it does, repeated until done or blocked:**

1. Runs `node $CLAUDE_PLUGIN_ROOT/scripts/ticket-queue.js`, which lists every ticket in `02-plan/tickets/` and, for each, checks its `03-implement/NN-<slug>/commit-log.md`: a ticket counts as done only if that file's Status line is exactly `**Status:** ✅ Done` (not the raw template's `In Progress / ✅ Done`, and not a still-open `In Progress`). Returns the full list plus `nextPending`, the first ticket that isn't done.
2. **If `nextPending` is null:** every ticket is done — report that and suggest `/gps finish`. Stop.
3. **Otherwise**, for `nextPending`:
   - Run `node $CLAUDE_PLUGIN_ROOT/scripts/ticket.js <N>` (same as `/gps ticket <N>`) to scaffold the workspace and print the spec.
   - Implement it the normal way — write the code, debug and fix issues as they come up, that's just development, not a "blocker." Run and test artifacts (build/run logs, output files) go under the session's scratch dir printed by `ticket.js`, never in the repo root or source tree.
   - Run the ticket's Verification Step command from its spec.
   - **On success:** run `node $CLAUDE_PLUGIN_ROOT/scripts/token-usage.js 03-<NN>-<slug>` (the phase key printed by `ticket.js` in the previous step) to get this ticket's token usage, then fill in `commit-log.md` (Status: `✅ Done`, the commit(s), test output, review notes, time spent, Token Usage — `unavailable` per line if the script returned `available: false`). Stage only the files this ticket touched (never `git add -A`) and commit them with a message referencing the ticket.
   - **On genuine failure** (verification won't pass after reasonable attempts, or the ticket needs information only the user can provide): leave `commit-log.md` as `**Status:** In Progress` with a filled-in Blockers/Challenges section explaining what's wrong. Do not commit. Stop the whole `/gps ship` loop here and report to the user which ticket and why.
4. Go back to step 1 and repeat, until `nextPending` is null or step 3 stops the loop on a failure.

**Output:** Every ticket implemented and committed, one commit per ticket — or a clear report of which ticket blocked the run and why.

**Example:**

```
/gps ship
```

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

- `improve-codebase-architecture` (mattpocock-skills) — invoked by `/gps scout`
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
