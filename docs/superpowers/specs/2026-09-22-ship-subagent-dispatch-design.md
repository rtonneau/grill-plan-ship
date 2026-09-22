# Subagent dispatch for `/gps ship`

## Problem Statement

`/gps ship` currently implements every ticket inline: the same Claude Code session that reads the spec also writes the code, runs verification, and commits. That keeps the whole feature's context in one place, but it means a long ship run accumulates every ticket's implementation detail in a single, ever-growing context window — and there's no way to hand a ticket off to a fresh, isolated context the way `superpowers:subagent-driven-development` does for arbitrary plans.

There's no `/gps`-native way to implement a ticket via a dispatched subagent instead of inline.

## Context & Constraints

- `/gps` commands are documented behavior in `SKILL.md`, not JS orchestration loops — the "loop" in `/gps ship` (run `ticket-queue.js`, implement, verify, commit, repeat) is a sequence of instructions Claude Code follows itself. This feature is a `SKILL.md` behavior change, not new tooling.
- `scripts/lib/ticket-queue.js`'s `listTickets()` already returns `ticketPath`, `implDir`, and `commitLogPath` per ticket — everything a dispatch prompt needs to point a subagent at, with no new script required.
- `scripts/lib/token-usage.js` already aggregates a phase's tokens across the main session transcript **and** `<transcriptsDir>/<sessionId>/subagents/*.jsonl` (see `transcriptFiles()`). A phase's `sessionIds` is recorded by `touchPhase()`, called from `ticket.js` using `process.env.CLAUDE_CODE_SESSION_ID` — the orchestrator's session ID, not any subagent's. As long as `ticket.js` (the scaffolding step) still runs in the orchestrator before a subagent is dispatched, usage accounting needs no change.
- `superpowers:subagent-driven-development` established the precedent this design follows for isolated-context implementation, and explicitly forbids parallel implementer dispatch ("conflicts"). This feature only ever runs one implementer subagent at a time.
- Distinct from `subagent-driven-development` itself: that skill brings its own ledger, task-brief/report file pairs, and a multi-round fix loop with a second reviewer subagent. This feature does not adopt any of that — `/gps` already has its own state (`commit-log.md`'s Status line) and this design keeps the existing single-attempt success/failure contract `/gps ship` documents today, just performed by a subagent instead of inline.

## Success Metrics

- At the start of every `/gps ship` invocation, Claude Code asks whether to implement this run's tickets via dispatched subagents or inline, and waits for an explicit answer before touching the ticket queue.
- In subagent mode, each ticket is implemented by one fresh `general-purpose` subagent, dispatched only after the previous ticket reached a terminal state (committed, or the loop stopped on failure) — never two implementer subagents live at once.
- A subagent's dispatch prompt points it at the ticket file, `commit-log.md` path, scratch dir, and phase key — not the ticket's full text pasted inline — and instructs it to orient from current repo state (`git log --oneline`, the files the ticket names) rather than assume unstated context from prior tickets.
- Token usage for a subagent-implemented ticket is computed and recorded the same way as an inline one today — no `available: false` regression.
- A subagent that finishes successfully reports DONE with commit SHA(s) and a one-line test summary; `/gps ship`'s loop advances to the next ticket exactly as it does today after an inline success.
- A subagent that cannot complete the ticket reports BLOCKED, leaves `commit-log.md` as `In Progress` with Blockers/Challenges filled in, makes no commit, and `/gps ship` stops the whole run and reports which ticket and why — identical to today's inline "genuine failure" behavior. No automatic retry, no second subagent, no separate reviewer pass.
- `/gps ticket <N>` (manual single-ticket) is unaffected — it stays inline-only.

## Architecture & Approach

### The ask

`SKILL.md`'s `/gps ship` section gains a new first step: before running `ticket-queue.js`, ask the user "Implement each ticket via a dispatched subagent, or inline in this session?" This is asked on every `/gps ship` invocation (not cached in `.session-config.json`, not re-asked per ticket within the same invocation) — the answer applies to every ticket this run processes.

### Per-ticket flow in subagent mode

For `nextPending`, unchanged from today:

1. Run `ticket-queue.js` to get `nextPending` (with `ticketPath`, `implDir`, `commitLogPath`).
2. Run `ticket.js <N>` — scaffolds `03-implement/NN-<slug>/`, writes the `commit-log.md` template if it doesn't exist, records the `phaseKey` via `touchPhase()` (in the orchestrator's session, per Context above), prints the scratch dir.

Then, new: instead of implementing inline, dispatch one `general-purpose` subagent (Agent tool, no `isolation: "worktree"` — same working tree is safe, since dispatch is sequential and commit-gated per Success Metrics). The dispatch prompt includes:

- **What to read as the spec:** the ticket file at `ticketPath` — read it, not content pasted into the prompt.
- **Orientation instruction:** check `git log --oneline` for commits since the session started, and read the files the ticket names, before assuming anything about prior tickets' implementation choices. The ticket's own text (Acceptance Criteria, Files to Touch, Notes) is the complete contract — nothing outside it or the current repo state is available.
- **The existing `/gps ship` contract**, unchanged in substance from what `SKILL.md` already documents for inline work:
  - Implement to satisfy the ticket.
  - Run the Verification Step command; artifacts go under the printed scratch dir, prefixed with `<N>-`.
  - On success: run `node $CLAUDE_PLUGIN_ROOT/scripts/token-usage.js <phaseKey>` and fill in `commit-log.md` (Status ✅ Done, commit(s), test output, review notes, time spent, Token Usage — `unavailable` per line if the script returns `available: false`). Stage only the files this ticket touched (never `git add -A`); commit with a message referencing the ticket.
  - On genuine failure: leave `commit-log.md` as `**Status:** In Progress` with Blockers/Challenges filled in; do not commit.
- **Report contract** (required, terminal):
  - `DONE` — commit SHA(s) + one-line test summary.
  - `BLOCKED` — one-line reason; `commit-log.md` already reflects it per the contract above.

### Orchestrator handling of the report

- `DONE` → loop back to `ticket-queue.js` and dispatch the next pending ticket, same as today's post-success behavior.
- `BLOCKED` → stop the `/gps ship` run immediately; report the blocked ticket and reason to the user. No retry, no fix loop, no second subagent — matches inline mode's existing failure behavior exactly.

### Model selection

Every implementer subagent uses `general-purpose` with the session's default model — no cheap/standard/capable tiering. This keeps the feature consistent with the plugin's MVP/no-TDD simplicity stance (`CLAUDE.md`: "Ship — Implement tickets one by one (manual, no TDD)"). Cost-based model tiering, if ever wanted, is a separate future change.

### No new scripts

`ticket-queue.js`, `ticket.js`, and `token-usage.js` are unchanged — every path and phase key a dispatch prompt needs is already in their existing output. This is purely a `SKILL.md` documentation/behavior change.

## Assumptions & Trade-offs

- No dependency or file-overlap tracking between tickets. Sequential, commit-gated dispatch means there's no unsafe interleaving for it to prevent (see Problem Statement's framing during design review); adding it now would be speculative complexity with no scenario it protects against under this design.
- Context isolation between tickets is accepted as a trade-off of subagent mode, not eliminated — mitigated by the orientation instruction and by leaning on ticket atomicity from `/gps plan`'s `writing-plans` phase, not by new tooling. A ticket that implicitly depends on undocumented context from a previous ticket is a ticket-authoring defect either way.
- No separate review-subagent pass after implementation. The implementer subagent verifies and commits itself, same as inline mode; this was an explicit design choice to keep `/gps ship` fast and match its "no TDD, manual implementation" framing, at the cost of not getting `subagent-driven-development`'s spec-compliance/quality gate.
- `/gps ticket <N>` is out of scope — only `/gps ship`'s multi-ticket loop gains subagent dispatch.

## Open Questions

None outstanding — scope, ask-frequency, parallelism, failure handling, and model selection were all resolved during brainstorming.

## Notes

This design deliberately does not adopt `subagent-driven-development`'s ledger, task-brief/report file pairs, or multi-round fix loop — `/gps` already has equivalent state (`commit-log.md`'s Status line, the ticket queue itself) and a simpler single-attempt contract that this feature preserves rather than replaces.
