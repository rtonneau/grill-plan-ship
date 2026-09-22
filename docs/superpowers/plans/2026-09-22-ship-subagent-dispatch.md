# /gps ship Subagent Dispatch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `/gps ship` implement each ticket via a dispatched subagent (sequential, one at a time) instead of always inline, by asking the mode every invocation and documenting the dispatch/report contract in `SKILL.md`.

**Architecture:** This is a `SKILL.md`-only documentation/behavior change — no new scripts. `/gps` commands are already instructions Claude Code follows itself (not JS orchestration loops), and `scripts/lib/ticket-queue.js` / `scripts/ticket.js` / `scripts/lib/token-usage.js` already expose every path and phase key a dispatch prompt needs. The single task rewrites the `### /gps ship` section of `skills/gps/SKILL.md` to add: an every-invocation mode question, a subagent-mode branch in the per-ticket loop (dispatch prompt contents, orientation instruction, DONE/BLOCKED report contract), and orchestrator handling of that report — while leaving the existing inline-mode behavior and `/gps ticket <N>` untouched.

**Tech Stack:** Markdown documentation only (`skills/gps/SKILL.md`). No code, no dependencies.

**Spec:** `docs/superpowers/specs/2026-09-22-ship-subagent-dispatch-design.md`

## Global Constraints

- No new scripts — this is a `SKILL.md` documentation/behavior change only (spec: Architecture & Approach, "No new scripts").
- Subagent dispatch is strictly sequential — never two implementer subagents live at once; ticket N+1's subagent is dispatched only after ticket N reaches a terminal state (committed, or the whole `/gps ship` run stopped) (spec: Success Metrics).
- `/gps ship` asks "subagent or inline?" on every invocation — never cached in `.session-config.json`, never re-asked mid-run; the answer applies to every ticket that invocation processes (spec: Architecture & Approach, "The ask").
- `/gps ticket <N>` (manual single-ticket) is unaffected and always runs inline (spec: Success Metrics).
- No separate review subagent and no retry/fix loop on BLOCKED — a blocked ticket always stops the run and surfaces to the user, exactly like inline mode's existing failure behavior (spec: Assumptions & Trade-offs).
- Every implementer subagent uses `general-purpose` with the session's default model — no cheap/standard/capable tiering (spec: Architecture & Approach, "Model selection").

---

### Task 1: Document `/gps ship` subagent dispatch (`skills/gps/SKILL.md`)

**Files:**
- Modify: `skills/gps/SKILL.md:258-280` (the `### /gps ship` section)

**Interfaces:**
- Consumes: nothing (documentation only; describes existing `ticket-queue.js` / `ticket.js` / `token-usage.js` output, unchanged)
- Produces: nothing consumed by a later task — this is the only task.

- [ ] **Step 1: Replace the `### /gps ship` section**

In `skills/gps/SKILL.md`, find this exact block (lines 258–280):

```markdown
### /gps ship

**When:** After tickets have been saved to disk (`/gps write` has run for the plan phase). Takes no arguments — it works through whatever tickets remain.

**What it does, repeated until done or blocked:**

1. Runs `node $CLAUDE_PLUGIN_ROOT/scripts/ticket-queue.js`, which lists every ticket in `02-plan/tickets/` and, for each, checks its `03-implement/NN-<slug>/commit-log.md`: a ticket counts as done only if that file's Status line is exactly `**Status:** ✅ Done` (the template starts as `In Progress`; older sessions' raw `In Progress / ✅ Done` also doesn't count). Returns the full list in ticket-number order plus `nextPending`, the first ticket that isn't done. Files not named `NN-<slug>.md` are skipped with a warning. It fails if the grill or plan phase isn't written yet.
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
```

Replace it with:

```markdown
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
     - The ticket file path (`02-plan/tickets/NN-<slug>.md`) to read as its complete spec — don't paste the ticket's text into the dispatch.
     - The `commit-log.md` path, the scratch dir, and the phase key (`03-<NN>-<slug>`).
     - An orientation instruction: check `git log --oneline` for commits made since this session started, and read the files the ticket names, before assuming anything about what a previous ticket did — a previous ticket's subagent shares no memory with this one, so the ticket's own text (Acceptance Criteria, Files to Touch, Notes) and the current repo state are the only things it can rely on.
     - The same on-success and on-failure contract as inline mode above: on success, run `token-usage.js`, fill in `commit-log.md`, stage only touched files, commit referencing the ticket; on failure, leave `commit-log.md` as `In Progress` with Blockers/Challenges filled in and make no commit. No separate review subagent — the implementer verifies and commits itself, same as inline mode.
     - A required terminal report: **DONE** with commit SHA(s) and a one-line test summary, or **BLOCKED** with a one-line reason.
     Wait for that report before doing anything else. On **DONE**, treat the ticket as complete — the subagent already filled `commit-log.md` and committed, so don't repeat those steps. On **BLOCKED**, stop the whole `/gps ship` loop and report to the user which ticket and why, exactly as inline mode's on-failure step does — no automatic retry, no second subagent.
4. Go back to step 1 and repeat, until `nextPending` is null or step 3 stops the loop on a failure.

**Output:** Every ticket implemented and committed, one commit per ticket — or a clear report of which ticket blocked the run and why.

**Example:**

```
/gps ship
```
```

- [ ] **Step 2: Verify the replacement**

Run: `grep -n "Mode:\|Subagent mode\|Inline mode\|DONE\|BLOCKED" skills/gps/SKILL.md`
Expected: matches inside the `### /gps ship` section only (roughly lines 258–290), including one `**Mode:**` line, one `**Subagent mode:**` bullet, one `**Inline mode:**` bullet, and the `DONE`/`BLOCKED` report-contract lines. No other section of the file should be touched — confirm with `git diff --stat` that only `skills/gps/SKILL.md` changed.

- [ ] **Step 3: Commit**

```bash
git add skills/gps/SKILL.md
git commit -m "docs: add subagent dispatch mode to /gps ship"
```

---

## Self-Review

**Spec coverage:**
- "The ask" (every invocation, not cached, applies to the whole run) → **Mode:** line. Covered.
- "Per-ticket flow in subagent mode" (dispatch prompt contents: ticket path, commit-log path, scratch dir, phase key, orientation instruction, existing contract, report contract) → **Subagent mode:** bullet. Covered.
- "Orchestrator handling of the report" (DONE → continue; BLOCKED → stop, report, no retry) → final two sentences of the **Subagent mode:** bullet. Covered.
- "Model selection" (general-purpose, no tiering) → parenthetical in the **Subagent mode:** bullet. Covered.
- "No new scripts" → no script files touched by this task. Covered.
- `/gps ticket <N>` unaffected → stated explicitly in the **Mode:** line. Covered.
- No separate review subagent → stated explicitly inside the **Subagent mode:** bullet. Covered.

**Placeholder scan:** No TBD/TODO, no "add appropriate handling," no unwritten references — the full replacement text is given verbatim as the deliverable itself (this is a documentation task, so the "step content" *is* the final SKILL.md prose, not code implementing it).

**Type/name consistency:** `general-purpose` (Agent tool's actual subagent type name), `token-usage.js`, `ticket-queue.js`, `ticket.js`, `commit-log.md`, phase key format `03-<NN>-<slug>` — all match the names already used elsewhere in `SKILL.md` and in `scripts/`.
