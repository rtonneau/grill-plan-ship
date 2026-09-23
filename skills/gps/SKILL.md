---
name: gps
description: "grill-plan-ship: universal workflow plugin (brainstorm → plan → implement). Use for /gps scout, /gps scout --from, /gps start, /gps status, /gps write, /gps plan, /gps ticket, /gps ship, /gps finish, /gps handoff, /gps resume."
---

# grill-plan-ship

Universal workflow plugin: brainstorm → plan → implement.

**Commands:**

- `/gps scout [--from <review-file>] [direction]` — Scan the codebase for architecture candidates, or read an existing review, and turn the result into ready-to-use `/gps start` seeds
- `/gps start <feature-name>` — Begin a new feature
- `/gps status` — Show every session's state, scouted ideas not started yet, and what's pending on the current one
- `/gps write` — Write the current phase's output (brainstorm resume, or plan + tickets) to disk
- `/gps plan` — Generate plan + tickets
- `/gps ticket <number>` — Implement ticket N
- `/gps ship` — Implement every remaining ticket in order, one commit each
- `/gps finish` — Close the session and write its summary
- `/gps handoff` — Save an in-flight checkpoint of the current session before stopping work
- `/gps resume` — Catch up on the current session using its saved handoff plus live state

---

## Overview

This plugin orchestrates a repeatable, documented workflow for any code project:

1. **Grill** (Session 1) — Brainstorm, clarify spec
2. **Plan** (Session 2) — Break work into atomic tickets
3. **Ship** (Session 3+) — Implement tickets one by one
4. **Finish** — Close and summarize

An optional `/gps scout` step can run before Grill to source feature candidates from an architecture review (or, with `--from`, from a review you already have), instead of starting `/gps start` from a blank idea.

All output lives in `.work/sessions/YYYY-MM-DD__<slug>/` with a standard structure (local date; `<slug>` is the feature name cleaned to lowercase `a-z 0-9 . _ -`).

---

## Rules for every command

- Every command runs its handler script with the exact `node $CLAUDE_PLUGIN_ROOT/scripts/<name>.js` line given below. **Never create, edit or delete session state by hand** (`.session-config.json`, `.current-session`, `.pending-seeds.json`, directories) to stand in for a handler.
- If a handler exits non-zero, it prints `❌ <what failed>` and a recovery hint on the next line. Show both to the user and stop that command — do not retry with different arguments or work around it.
- Handlers never overwrite existing work: re-running `/gps start`, `/gps plan`, `/gps ticket` or `/gps finish` against existing output either refuses (changing nothing) or resumes, as described per command.

---

## Dependencies

`/gps` invokes these automatically as part of its own commands — you never run them yourself:

- **Architecture review** — invoked by `/gps scout` (not by `/gps scout --from`, which reads your review instead). Use the first one available: `improve-codebase-architecture`, then `mattpocock-skills:codebase-design`. If neither is available, stop and tell the user to install the `mattpocock-skills` plugin.
- **brainstorming** (superpowers) — invoked by `/gps start` for ideation and spec clarification
- **writing-plans** (superpowers) — invoked by `/gps plan` to turn the approved resume into tickets
- **unslop** — invoked by `/gps plan` on each generated ticket for crisp language. If it isn't available, skip that step and tell the user it was skipped.

If `brainstorming` or `writing-plans` is not available, stop and tell the user to install the `superpowers` plugin.

---

## Commands

### /gps scout [--from <review-file>] [direction]

**When:** Before you know what feature to build — you want the codebase itself to suggest candidates.

**What it does:**

1. Calls the Skill tool with the architecture-review skill (first available of `improve-codebase-architecture`, `mattpocock-skills:codebase-design`; if neither exists, stop and tell the user to install `mattpocock-skills`), passing `[direction]` through verbatim as its prompt argument (e.g. `only review sim.cc`). Omit `[direction]` to let that skill infer hot spots from git history instead.
2. Follows that skill's own process for its steps 1 (Explore) and 2 (Present candidates as an HTML report) exactly as written — the same self-contained HTML report gets written to the OS temp dir and opened for you.
3. Does **not** proceed to that skill's step 3 (the grilling loop). Instead, for every candidate card in the report, Claude Code synthesizes a seed entry. Required: `slug` (lowercase `a-z 0-9`, with `-`, `_` or `.` only between them, max 64 chars — this becomes the `/gps start` argument), `strength` (exactly `Strong`, `Worth exploring` or `Speculative`), `problem`, `solution`. Optional: `files` (array of paths), `benefits`.
4. Writes `{ "sourceDirection": "<direction>" | null, "candidates": [ ... ] }` to a temp JSON file and runs `node $CLAUDE_PLUGIN_ROOT/scripts/scout-merge.js <tempReportPath> <entriesJsonPath>`, which:
   - Validates every candidate first; any invalid candidate fails the whole run before anything is written.
   - Copies the HTML report, unmodified, into `.work/sessions/scout-reports/architecture-review-<timestamp>.html` (a `-2`, `-3`, … suffix if that name exists) — this copy is write-once and is never edited or deleted by any later `/gps` command.
   - Merges the seed entries into `.work/sessions/.pending-seeds.json`, keyed by slug (a slug that already exists there gets overwritten with the fresh version; other slugs are untouched). A slug repeated within one run keeps its first occurrence, with a warning. An unreadable seeds file is moved aside to `.pending-seeds.json.corrupt-<timestamp>`, with a warning, and a fresh one is started.
   - Prints a JSON summary of what was seeded (plus any `warnings`).
5. Claude Code presents that summary in chat: each candidate's slug, strength badge, one-line problem, an explicit `/gps start <slug>` line to copy, and any warnings.

**Output:** The HTML report (temp + a permanent copy under `.work/sessions/scout-reports/`), plus a chat list of ready-to-run `/gps start <slug>` commands.

**Next:** Run `/gps start <slug>` for whichever candidate you want to pursue — if a seed matches, brainstorming opens already seeded with that candidate's problem/solution/files instead of starting from zero.

**Example:**

```
/gps scout only review sim.cc
```

#### With `--from <review-file>`

**When:** A review already exists — a code review, audit or hardening report, in Markdown or any other text format — and you want its findings turned into sessions instead of retyping them.

**Syntax:** `/gps scout --from <review-file> [direction]`. `--from` comes first and takes exactly one path (relative to the project root, or absolute). Everything after it is `[direction]`, e.g. `only Critical and High` or `one candidate per finding`.

**What it does instead of steps 1–4 above:**

1. Invokes **no** architecture-review skill and writes no HTML report — `mattpocock-skills` is not needed.
2. Reads the review file with the Read tool. If it can't be read, stop and tell the user; never guess its content.
3. Synthesizes seed entries with the same fields as step 3 above, plus the optional `severity`:
   - **Group related findings into one candidate** — one candidate per future session, clustering findings that touch the same files or share a fix. If the review has its own improvement plan or grouping, follow it. If `[direction]` asks for one candidate per finding, do that instead; `[direction]` can also filter which findings count.
   - Start each `problem` with the finding IDs it covers when the review has IDs (e.g. `C1, H1, M8, M9: …`).
   - `severity`: the highest severity among the grouped findings, in the review's own words (`Critical`, `P0`, …; non-empty, max 32 characters). Omit it if the review has no severity scale.
   - `strength`: your confidence the change is worth doing, informed by the review's certainty ("tested", "confirmed" → `Strong`; "plausible, verify" → `Worth exploring` or `Speculative`).
   - `files`: the paths the review names for those findings.
   - Open decisions the review lists go into the `problem` or `solution` of the seed they affect, so brainstorming raises them.
4. Writes `{ "sourceDirection": "<direction>" | null, "candidates": [ ... ] }` to a temp JSON file and runs `node $CLAUDE_PLUGIN_ROOT/scripts/scout-merge.js --from <review-file> <entriesJsonPath>`. It validates and merges exactly as above, but archives the review byte-for-byte as `.work/sessions/scout-reports/review-<stem>-<timestamp><ext>` (original extension kept, write-once) and records `severity` and `sourcePath` (the original review's path, project-relative when inside the project) on every seed.
5. Presents the summary as in step 5 above, showing `severity · strength` as the badges (just the strength when a seed has no severity).

**Example:**

```
/gps scout --from docs/reviews/2026-09-22-dotfiles-review.md
```

---

### /gps start <feature-name>

**When:** Beginning a new feature.

**Run:** `node $CLAUDE_PLUGIN_ROOT/scripts/start-session.js "<feature-name>"`

**What it does:**

1. Cleans the feature name into a slug (e.g. `Add Dark Mode!` → `add-dark-mode`, printed when it changed; an empty result becomes `untitled-<HHMMSS>`) and creates the session directory `.work/sessions/YYYY-MM-DD__<slug>/` (local date). **If that session already exists, it fails and changes nothing** — tell the user and suggest `/gps status` or a different name.
2. Creates `.work/sessions/YYYY-MM-DD__<slug>/.session-config.json`, recording `scratch_dir`
   Also creates the session's scratch directory `.scratch/tests/YYYY-MM-DD__<slug>/` (for build/run/test artifacts) and appends `.work/` and `.scratch/` to the project's `.gitignore` if missing.
3. Creates `.work/sessions/YYYY-MM-DD__<slug>/01-grill/` directory
4. Creates empty `resume.md` and `notes.md` templates
5. Writes `.work/sessions/.current-session` pointing at this session, so later commands operate on it regardless of what other sessions exist
6. Looks up `.work/sessions/.pending-seeds.json` for an entry whose slug matches this session's slug (e.g. `/gps start runconfig-resolver` matches a seed keyed `runconfig-resolver`, written earlier by `/gps scout`). If found, removes that entry from the seeds file — consumed seeds don't linger — and carries its `problem`/`solution`/`files`/`sourceReport` (plus `severity` and `sourcePath` for seeds from `/gps scout --from`) forward as the starting context for brainstorming. If no match, brainstorming starts from zero as it always has.
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

**When:** Reorienting after returning to a project, losing context, switching machines, after `/gps scout`, or any time you need a "where did I leave off?" answer. Takes no arguments. Read-only — it never writes or modifies any session file.

**What it does:**

1. Runs `node $CLAUDE_PLUGIN_ROOT/scripts/status.js`, which:
   - Lists every session under `.work/sessions/` with its feature name, creation date, `finishedAt`, and `phase` (computed from the session's files: `grill`, `plan-not-started`, `plan`, `ship`, `finish-pending`, `plan-complete` or `finished`; old `status` / `phases_completed` config fields are ignored).
   - Lists every scouted idea not started yet as `ideas` (from `.work/sessions/.pending-seeds.json`; `/gps start <slug>` removes an idea once it becomes a session), strongest first: `slug`, `strength`, `severity`, `problem`, `sourceReport`, `sourcePath`, `createdAt`, `startCommand`. If that file is unreadable, `ideas` is empty and `ideasProblem` says why — status never moves or repairs it.
   - Resolves the current session from `.work/sessions/.current-session` (same logic as every other command — there is no fallback to "the most recent session"). If the pointer is missing, invalid, points at a deleted session or at a finished one, `current` is `null` and `currentProblem` explains why and lists the unfinished sessions: show that to the user, ask which session to use, and only after they confirm run `node $CLAUDE_PLUGIN_ROOT/scripts/set-current.js <session-id>`.
   - Otherwise, for the current session only, adds:
     - `phase` and `suggestedNext` (`{ command, why }`) — the next command to run and why.
     - `writeTarget` — whether `/gps write` has something pending (`grill`, `plan`, or `none`), same detection `/gps write` itself uses.
     - `tickets` / `nextPending` — the ticket queue, same detection `/gps ship` itself uses; `skippedTicketFiles` lists files in `02-plan/tickets/` that aren't named `NN-<slug>.md` and are ignored.
     - `gitLog` — up to 10 project-wide commits (oneline) made since the session was created, so recent implementation activity is visible even without opening `commit-log.md` files.
     - `hasHandoff` — whether a saved checkpoint exists for this session (`HANDOFF.md` present). When true, Claude Code's rendered report should mention `/gps resume` is available for full context.
2. Claude Code renders that JSON as a short human-readable report:
   - One line per session: feature name and phase.
   - If `ideas` is non-empty: a table of the scouted ideas not started yet (slug, `severity · strength` or just the strength, one-line problem), each with its `/gps start <slug>` line to copy. Show `ideasProblem` if set.
   - For the current session: which phase is pending and why, ticket progress (`X/Y done`, next pending ticket if any), and the recent commits.
   - Ends with `suggestedNext.command` and its `why`, verbatim — do not work out the next command yourself. With no sessions but pending ideas, `suggestedNext` sits at the top level of the report and names the first-ranked idea; you may add one sentence on why another idea could come first (e.g. a dependency the review names), but still print `suggestedNext` as given.
   - It exits with `No sessions found.` only when there are neither sessions nor ideas.

**Output:** A status report printed in chat. No files are created or changed.

**Example:**

```
/gps status
```

---

### /gps handoff

**When:** Stopping work on the current session — end of day, context running low, switching to something else — and you want a future session (yours or a fresh AI's) to pick it back up with full context, not just "what phase is pending." Takes no arguments.

**What it does:**

1. Runs `node $CLAUDE_PLUGIN_ROOT/scripts/handoff.js`, which resolves the current session and auto-fills everything derivable from disk/git into `HANDOFF.md` at the session root: current phase, active ticket, ticket-queue state, project-wide commits since the session started, and uncommitted changes shown separately for the whole project and for the session directory. It prints this data as JSON.
2. Claude Code then fills in `HANDOFF.md`'s remaining narrative placeholders directly (Edit tool, not the script): where work stopped, the reasoning behind the current approach (including alternatives tried and rejected), the next concrete action to take, open questions only the user can resolve, decisions already settled (so a future session doesn't re-ask), and — only if either git status isn't "clean" — why the changes aren't committed yet.
3. `HANDOFF.md` is a single file: each run overwrites the previous one. There is no history log.

**Output:** `HANDOFF.md` written to the session root with full narrative context.

**Example:**

```
/gps handoff
```

### /gps resume

**When:** Picking a session back up after a break. Takes no arguments. Read-only — never writes or modifies any session file.

**What it does:**

1. Runs `node $CLAUDE_PLUGIN_ROOT/scripts/resume.js`, which resolves the current session, reads `HANDOFF.md` if one exists, and independently recomputes live state (ticket queue, git log, git status) the same way `/gps handoff` does — so it never trusts stale narrative for facts it can verify itself. If the handoff's recorded phase or active ticket disagrees with the freshly computed values, it's reported as `drift`.
2. If no `HANDOFF.md` exists, `live` is still fully populated and `handoff` is `null` — the command degrades gracefully rather than failing.
3. Claude Code renders the result as one combined briefing in chat: the handoff's narrative sections (if present), the live facts, any drift warning, and `live.suggestedNext` (the same next command `/gps status` gives).

**Output:** A catch-up briefing printed in chat. No files are created or changed.

**Example:**

```
/gps resume
```

---

### /gps write

**When:** After the brainstorming conversation `/gps start` began has been approved (before `/gps plan`), or after the writing-plans conversation `/gps plan` began has been approved (before `/gps ticket`). Takes no arguments — it detects which phase needs writing.

**What it does:**

1. Runs `node $CLAUDE_PLUGIN_ROOT/scripts/write-target.js`, which resolves the current session and inspects its files for unfilled placeholders — `<!-- gps:fill ... -->` markers (sessions created before template version 2 use `{{ ... }}` instead) — to decide what's pending:
   - `01-grill/resume.md` still has placeholders → **grill** phase is pending.
   - Otherwise, if `02-plan/plan.md` doesn't exist yet → nothing to write; run `/gps plan` first.
   - Otherwise, if `02-plan/plan.md` or any ticket file still has placeholders → **plan** phase is pending.
   - Otherwise → nothing pending.
   - When a phase is pending, it also computes that phase's real token usage (parsed from Claude Code's own session transcripts) and includes it as `tokenUsage` in its JSON output — either `{ available: true, input, output, cacheRead, cacheCreation, total }` or `{ available: false }`.
2. **If grill is pending:** Claude Code synthesizes the brainstorming conversation into `01-grill/resume.md`, filling in every template section (Problem Statement, Context & Constraints, Success Metrics, Architecture & Approach, Assumptions & Trade-offs, Open Questions, Notes, Token Usage) — replacing every `<!-- gps:fill ... -->` marker (or `{{ ... }}` in older sessions) with real content. For Token Usage, use the `tokenUsage` values from step 1's output verbatim; if `available` is `false`, write `unavailable` for each line instead of a number.
3. **If plan is pending:** Claude Code synthesizes the most recent writing-plans output into `02-plan/plan.md` (including its Token Usage section, filled the same way as grill's), then replaces the placeholder ticket stubs in `02-plan/tickets/` with one real `NN-<slug>.md` file per actual ticket (the ticket count is whatever writing-plans produced, not fixed at 4). It then runs `node $CLAUDE_PLUGIN_ROOT/scripts/mark-plan-written.js`, which checks that the plan is fully written (no placeholders, no `[slug]` stubs, at least one valid ticket). If it fails, fix what it lists and run it again.
4. **If nothing is pending:** reports that and suggests the next command (`/gps plan`, `/gps ticket <N>`, or `/gps finish`).

**Output:** The pending phase's files written to disk with real content, ready for the next command.

**Example:**

```
/gps write
```

---

### /gps plan

**When:** After reviewing the grill session (resume.md approved).

**Run:** `node $CLAUDE_PLUGIN_ROOT/scripts/plan.js`

**What it does:**

1. Resolves the current session via `.work/sessions/.current-session`, then reads its `01-grill/resume.md` (fails if it still contains unfilled placeholders)
2. **Fails and changes nothing if `02-plan/plan.md` already exists** — its hint says whether to run `/gps write` (plan still pending) or `/gps ship` (plan already written).
3. Creates `02-plan/plan.md` and placeholder ticket stubs in `02-plan/tickets/` for `/gps write` to replace
4. Immediately invokes the `writing-plans` skill against the approved `resume.md` to generate the actual tickets, then invokes `unslop` on each resulting ticket (skipped with a notice if `unslop` isn't available) — do not wait for or ask the user to run these themselves

**Output:** The writing-plans conversation begins right away.

**Next:** Once the tickets are approved, run `/gps write` to save the plan and tickets to disk, then `/gps ship` to implement them.

---

### /gps ticket <number>

**When:** Starting implementation of a single ticket by hand. To implement every remaining ticket in one go, use `/gps ship` instead.

**Run:** `node $CLAUDE_PLUGIN_ROOT/scripts/ticket.js <number>`

**What it does:**

1. Fails unless the plan phase has been written (`/gps write`); `<number>` must be digits (`3`, `03` and `003` are the same ticket).
2. Reads `02-plan/tickets/NN-<slug>.md` (if several files share the number, the first not-yet-done one in filename order)
3. If that ticket's `commit-log.md` says `**Status:** ✅ Done`, reports that and changes nothing.
4. Otherwise creates `03-implement/NN-<slug>/` and a `commit-log.md` template — **an existing log is kept, never overwritten**, so an interrupted ticket resumes from its notes.
5. Records this ticket's token-usage phase key (`03-NN-<slug>`) in `.session-config.json`, so usage can be computed later when the ticket is finalized
6. Prints ticket spec to console, including that phase key and the session's scratch dir (backfilled, with a warning, for sessions started before scratch dirs existed)

**Output:** Workspace + spec printed. Ready to code.

---

### /gps ship

**When:** After tickets have been saved to disk (`/gps write` has run for the plan phase). Takes no arguments — it works through whatever tickets remain.

**Mode:** Before running the ticket loop, ask: "Implement each ticket via a dispatched subagent, or inline in this session?" Wait for an explicit answer before continuing. Ask this every time `/gps ship` is invoked — never cache the answer in session state, and never re-ask mid-run; whichever answer you get applies to every ticket this invocation processes. `/gps ticket <N>` (manual single-ticket implementation) is unaffected — it always runs inline.

**What it does, repeated until done or blocked:**

1. Runs `node $CLAUDE_PLUGIN_ROOT/scripts/ticket-queue.js`, which lists every ticket in `02-plan/tickets/` and, for each, checks its `03-implement/NN-<slug>/commit-log.md`: a ticket counts as done only if that file's Status line is exactly `**Status:** ✅ Done` (the template starts as `In Progress`; older sessions' raw `In Progress / ✅ Done` also doesn't count). Returns the full list in ticket-number order plus `nextPending`, the first ticket that isn't done. Files not named `NN-<slug>.md` are skipped with a warning. It fails if the grill or plan phase isn't written yet.
2. **If `nextPending` is null:** every ticket is done — report that and suggest `/gps finish`. Stop.
3. **Otherwise**, for `nextPending`:
   - Run `node $CLAUDE_PLUGIN_ROOT/scripts/ticket.js <N>` (same as `/gps ticket <N>`) to scaffold the workspace and print the spec, the scratch dir, and the token-usage phase key (`03-<NN>-<slug>`).
   - **Inline mode:** implement it yourself the normal way — write the code, debug and fix issues as they come up, that's just development, not a "blocker." Run and test artifacts (build/run logs, output files) go under the session's scratch dir printed by `ticket.js`, never in the repo root or source tree. Run the ticket's Verification Step command from its spec.
     - **On success:** run `node $CLAUDE_PLUGIN_ROOT/scripts/token-usage.js 03-<NN>-<slug>` to get this ticket's token usage, then fill in `commit-log.md` (Status: `✅ Done`, the commit(s), test output, review notes, time spent, Token Usage — `unavailable` per line if the script returned `available: false`). Stage only the files this ticket touched (never `git add -A`) and commit them with a message referencing the ticket.
     - **On genuine failure** (verification won't pass after reasonable attempts, or the ticket needs information only the user can provide): leave `commit-log.md` as `**Status:** In Progress` with a filled-in Blockers/Challenges section explaining what's wrong. Do not commit. Stop the whole `/gps ship` loop here and report to the user which ticket and why.
   - **Subagent mode:** dispatch one `general-purpose` subagent (Agent tool, no model override — it inherits the session's default model; no worktree isolation — the same working tree is safe here because dispatch is strictly sequential: this ticket reaches a terminal state, committed or blocked, before the next ticket's subagent is ever dispatched). Never have two implementer subagents live at once. Give the dispatch prompt:
     - The ticket's full `ticketPath` value as already returned by `ticket-queue.js` for this ticket — to read as its complete spec — not a hand-assembled `02-plan/tickets/NN-<slug>.md` fragment; don't paste the ticket's text into the dispatch.
     - The `commitLogPath` and scratch dir exactly as printed by `ticket.js` in this same step — not re-derived or abbreviated — plus the phase key (`03-<NN>-<slug>`).
     - An orientation instruction: check `git log --oneline` for commits made since this session started, and read the files the ticket names, before assuming anything about what a previous ticket did — a previous ticket's subagent shares no memory with this one, so the ticket's own text (Acceptance Criteria, Files to Touch, Notes) and the current repo state are the only things it can rely on.
     - The same on-success and on-failure contract as inline mode above: on success, run the exact command line with `$CLAUDE_PLUGIN_ROOT` and the phase key already substituted — e.g. `node $CLAUDE_PLUGIN_ROOT/scripts/token-usage.js 03-<NN>-<slug>` with `<NN>-<slug>` filled in for this ticket, the same way the Inline mode bullet spells it out — then fill in `commit-log.md`, stage only touched files, commit referencing the ticket; on failure, leave `commit-log.md` as `In Progress` with Blockers/Challenges filled in and make no commit. No separate review subagent — the implementer verifies and commits itself, same as inline mode.
     - An explicit instruction that the subagent does this ticket's work itself and never dispatches subagents of its own — no helpers, no self-review-then-second-opinion, nothing — so only one implementer is ever live on the working tree.
     - A required terminal report: **DONE** with commit SHA(s) and a one-line test summary, or **BLOCKED** with a one-line reason.
     Wait for that report before doing anything else. On **DONE**, treat the ticket as complete — the subagent already filled `commit-log.md` and committed, so don't repeat those steps. If the next `ticket-queue.js` run (step 1) still returns this same ticket as `nextPending` after a DONE report, that DONE was inaccurate — stop the whole `/gps ship` run and report it to the user, rather than dispatching another subagent at it. On **BLOCKED**, stop the whole `/gps ship` loop and report to the user which ticket and why, exactly as inline mode's on-failure step does — no automatic retry, no second subagent.
4. Go back to step 1 and repeat, until `nextPending` is null or step 3 stops the loop on a failure.

**Output:** Every ticket implemented and committed, one commit per ticket — or a clear report of which ticket blocked the run and why.

**Example:**

```
/gps ship
```

---

### /gps finish

**When:** All tickets complete (or, for a bounded session, once the resume is saved and the work is done).

**Run:** `node $CLAUDE_PLUGIN_ROOT/scripts/finish.js`

**What it does:**

1. Fails and changes nothing if the session is already finished, the grill or plan phase is not written yet, or any ticket is not Done (it lists which).
2. Generates `INDEX.md` (session summary with every ticket and links to its spec and log)
3. Records `finished_at` in `.session-config.json`
4. Clears `.work/sessions/.current-session`
5. Prints an `UNFINISHED_SESSIONS [...]` line. If it lists any sessions, ask the user whether to switch to one of them. Only if they say yes, run `node $CLAUDE_PLUGIN_ROOT/scripts/set-current.js <session-id>`. Otherwise suggest `/gps start <feature-name>`.

**Output:** Summarized session, ready to start the next feature.

---

### Switching the current session (internal, no `/gps` command)

`node $CLAUDE_PLUGIN_ROOT/scripts/set-current.js <session-id>` points `.work/sessions/.current-session` at an existing, unfinished session. Run it **only after the user confirms** a switch — after `/gps finish`, or when a handler reports that the current session can't be resolved.

---

## Composable Skills

`/gps` commands invoke these automatically — you never run them directly:

- `improve-codebase-architecture` or `mattpocock-skills:codebase-design` — invoked by `/gps scout` (skipped with `--from`)
- `brainstorming` (superpowers) — invoked by `/gps start`
- `writing-plans` (superpowers) — invoked by `/gps plan`
- `unslop` — invoked by `/gps plan`, after writing-plans, for crisp language (skipped with a notice if unavailable)

---

## Installation

```
/plugin marketplace add rtonneau/grill-plan-ship
/plugin install grill-plan-ship
```

## Update

```
/plugin marketplace update rtonneau/grill-plan-ship
```

## Restart Claude Code

Then in any project:

```
/gps start your-feature-name
```
