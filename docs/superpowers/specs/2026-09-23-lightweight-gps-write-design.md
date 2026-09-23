# Lightweight `/gps write` and split SKILL.md — Design

**Date:** 2026-09-23
**Status:** Draft, awaiting review

## Goal

`/gps write` should be fast and need almost no thinking. It saves an already-approved design (grill) or plan (plan phase) to disk. It does not redesign anything.

**Success criteria:**

- A `/gps write` run loads about 60 lines of instructions (short SKILL.md + `references/write.md`) instead of 376.
- A `/gps write` run takes 3 tool calls in the normal case (`write-target.js`, one Write, `write-apply.js`), whatever the ticket count.
- The model never reads a template, never copies token-usage numbers and never deletes stub files by hand.
- Every other `/gps` command behaves as before and is typed the same way (`/gps <command>`).

## Where the time goes today

`write-target.js` takes about 0.1 s. The cost is on the model side:

1. The whole 376-line SKILL.md loads for every command.
2. The instruction ("synthesize the conversation… fill in every section") invites re-thinking agreed content.
3. There are many tool calls: read `resume.md`/`plan.md` before overwriting it, one Write per ticket, deleting stubs, `mark-plan-written.js`, and fix-and-retry.
4. Token-usage numbers are copied by hand from JSON into markdown.

## Part 1 — Split SKILL.md into a router plus per-command references

### Layout

```
skills/gps/
├── SKILL.md              ← router, about 40 lines
└── references/
    ├── scout.md          ← includes the --from variant
    ├── start.md
    ├── status.md
    ├── handoff.md
    ├── resume.md
    ├── write.md
    ├── plan.md
    ├── ticket.md
    ├── ship.md
    └── finish.md
```

Claude Code auto-loads only `SKILL.md`. It reads the other files in the skill directory only when told to.

### What stays in SKILL.md

- The frontmatter (`name`, `description`), unchanged, so `/gps` triggers the same way.
- The command table (one line per command).
- The routing instruction: *"Read `references/<command>.md` in this skill's directory for the command you were given, and only that file. Don't act on a command before reading its file."*
- A one-paragraph overview and the session directory convention (`.work/sessions/YYYY-MM-DD__<slug>/`).
- "Rules for every command" (handler-only state changes, `❌` + hint handling, no overwrites).
- The internal `set-current.js` note, since both `finish` and handler errors use it.

### What moves or goes

- Each `### /gps <command>` section moves verbatim, apart from the edits listed below, into `references/<command>.md`.
- **Dependencies** and **Composable Skills** say the same thing twice. Each skill dependency moves into the command file that invokes it (architecture review → `scout.md`, brainstorming → `start.md`, writing-plans and unslop → `plan.md`), along with its "stop and tell the user to install X" line.
- **Installation / Update / Restart** are removed from SKILL.md. The README already covers installation. Check this during implementation and move anything missing.

### Cross-references

- In `start.md`, the bounded-path bullet no longer says "using the same full-template process `/gps write` performs". It says: follow the grill steps in `references/write.md`.
- `ship.md` keeps its own reference to `ticket.js`. It doesn't need to read `ticket.md`.
- `docs/TUTORIAL.md` (2 mentions) and `CLAUDE.md` (architecture tree, "Key Files" section) are updated to describe the router and references.

### Guard test

A new test in `scripts/handlers.test.js`:

- Every command in SKILL.md's command table has a `skills/gps/references/<command>.md` file, and every references file has a table entry.
- Every references file for a command with a handler contains its `node $CLAUDE_PLUGIN_ROOT/scripts/<handler>.js` line. This keeps the T-07 guarantee after the split.

## Part 2 — Payload-based `/gps write`

### Flow

1. `node $CLAUDE_PLUGIN_ROOT/scripts/write-target.js`. Same detection as today. When a phase is pending, it also prints:
   - `payloadPath`: `<sessionDir>/.write-payload.md`
   - `sections`: the `## ` headings the payload must contain, in order. They are read from the file on disk (`resume.md` or `plan.md`), so legacy sessions work unchanged. `Token Usage` is excluded.
   - For plan: the ticket block format (below).
2. The model writes the payload with one Write call. Instruction in `write.md`: *transcribe what was agreed in the conversation (the approved brainstorming design, or the approved writing-plans output); don't re-brainstorm or re-plan.*
3. `node $CLAUDE_PLUGIN_ROOT/scripts/write-apply.js` applies it.

### Payload format

Grill:

```markdown
## Problem Statement
...
## Context & Constraints
...
(one block per heading in `sections`)
```

Plan: the plan sections, then one block per ticket:

```markdown
## Strategy
...
## Assumptions
...

--- ticket: 01-add-parser ---
**Acceptance Criteria:**
- [ ] ...

**Files to Touch:**
...

--- ticket: 02-wire-cli ---
...
```

`write.md` describes the ticket body structure (Acceptance Criteria, Files to Touch, Verification Step, Notes) in a few lines, so the model doesn't read `templates/02-ticket.md`.

Parsing rules:

- A `## ` heading starts a section only outside fenced code blocks.
- A line matching `^--- ticket: (\d+)-(<slug>) ---$` starts a ticket. Everything up to the next separator (or end of file) is that ticket's body, `## ` headings included.
- Text before the first `## ` heading is ignored.

### What `write-apply.js` does

1. Resolves the session and runs `resolveWriteTarget`. If nothing is pending: `❌` and a hint pointing to the next command.
2. Reads the payload. If it's missing: `❌ No payload at <path>` and a hint to write it first.
3. Validates everything before writing anything:
   - Every expected section is present and non-empty. No unknown sections, no duplicates.
   - No `<!-- gps:fill` markers remain (and no `{{ … }}` in legacy sessions, via `placeholderTester`).
   - Plan only: at least one ticket, valid `NN-<slug>` names (`parseTicketFilename` rules), no duplicate names, no empty ticket bodies.
   - Plan only: `02-plan/tickets/` holds nothing but `[slug]` stubs. Any other `.md` there (e.g. from an earlier hand-written attempt) is listed as an error for the user to remove or move. The script never deletes it.
   All errors are listed together in one `❌` message.
4. Renders the target file: keeps the on-disk preamble (everything before the first `## `, e.g. title and date), then each section in on-disk order with the payload body, then a `## Token Usage` section generated from `computeUsage` (`unavailable` on every line when `available: false`).
5. Plan only: writes `02-plan/tickets/NN-<slug>.md` as `# Ticket N: <slug>` plus the body, and deletes the `[slug]` stubs.
6. Runs the old `mark-plan-written.js` checks (moved into `lib/write-target.js` as `checkPlanWritten`) as a final check.
7. Deletes the payload and prints `✅ Grill written for <id>. Next: /gps plan` or `✅ Plan written for <id>: N ticket(s). Next: /gps ship`.

On any validation error nothing is written and the payload is kept. The model edits it (the Write tool already has it in context) and runs `write-apply.js` again.

### Files

- **New:** `scripts/write-apply.js` (thin handler, `runCli`), `scripts/lib/write-payload.js` (`parsePayload`, `renderPhaseFile`) + `write-payload.test.js`.
- **Changed:** `scripts/write-target.js`, `scripts/lib/write-target.js` (sections from disk, `checkPlanWritten`), `scripts/handlers.test.js`, `scripts/e2e.test.js`.
- **Removed:** `scripts/mark-plan-written.js`. Its checks run inside `write-apply.js`; its tests move to the `write-apply` handler tests.
- **Docs:** `skills/gps/references/write.md` (about 15–20 lines), the `start.md` bounded bullet, README, CLAUDE.md architecture tree.

## Testing

- `write-payload.test.js`: grill and plan payloads parse; missing, unknown and duplicate sections; `## ` inside a code fence; ticket separators (valid, bad slug, duplicate, empty body); a non-stub ticket file already on disk; leftover `gps:fill`; legacy `{{ }}` session.
- `handlers.test.js`: `write-apply.js` for grill (resume filled, Token Usage generated, payload deleted); for plan (tickets written, stubs gone, `✅ … N ticket(s)`); failure leaves files and payload untouched; no pending phase → `❌`. The SKILL router guard test from Part 1.
- `e2e.test.js`: the start → write → plan → write → ship path uses payloads instead of hand-written files and `mark-plan-written.js`.
- Everything runs via `node scripts/run-tests.js`.

## Out of scope

- Parsing writing-plans' own saved plan file directly (option C). The model still transcribes it into the payload.
- Changing template content or headings.
- Changing other commands' behavior.
