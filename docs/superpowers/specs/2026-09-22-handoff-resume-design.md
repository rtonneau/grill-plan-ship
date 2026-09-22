# Session handoff & resume

## Problem Statement

A gps session can span days, with real work happening between visits: mid-ticket debugging, approaches tried and abandoned, decisions made in conversation that never make it into any committed file. Two things already help you reorient, but neither covers this:

- `/gps status` is read-only and purely file-derived — it can report ticket/phase state, but has no way to see reasoning that was never written down.
- The generic `handoff` skill (mattpocock-skills) and its paired `/start-from-last-handoff` command compact a conversation for a fresh agent, but know nothing about gps sessions, tickets, or phases — they treat the work as an undifferentiated project.

There's no way to deliberately checkpoint the in-flight reasoning of a gps session before stopping, and no gps-aware way to catch a human or an AI back up on it later.

## Context & Constraints

- Session-scoped commands (`/gps status`, `/gps ship`, `/gps ticket`) resolve the current session via `.work/sessions/.current-session`, same lookup every time (`scripts/lib/session-store.js`).
- `scripts/lib/status.js` already computes ticket-queue state (`scripts/lib/ticket-queue.js`) and recent commits (`git log --oneline -n 5 -- <sessionDir>`) for the current session. Both are reused here rather than recomputed.
- Templates use the `{{ }}` placeholder convention rendered by `scripts/lib/templates.js` (`loadTemplate` / `renderTemplate`). `write-target.js`'s placeholder-scan is specific to grill/plan phase detection and does not apply here — a handoff isn't a phase with pending/complete state, it's a checkpoint that's either present or absent.
- This project's own convention (`CLAUDE.md`): handlers use Node's `fs` module only (no external dependencies), print clear `✅`/`❌` console feedback, and use ISO 8601 timestamps.
- Distinct from the generic `handoff`/`start-from-last-handoff` pair: those remain the right tool for compacting an arbitrary conversation or handing off across projects. This feature is scoped strictly to an active gps session and is aware of its structure (phase, ticket, scratch dir).

## Success Metrics

- Running `/gps handoff` before stopping work produces a `HANDOFF.md` in the session root capturing: where work stopped, the reasoning behind the current approach, the next concrete action, open questions, settled decisions, and why any uncommitted changes exist.
- Running `/gps resume` later produces one combined briefing — narrative from the handoff plus freshly computed live state — readable by the user as a catch-up, and by the AI as a re-entry primer, in a single command.
- `/gps resume` never presents stale narrative as fact: if live ticket/commit state has moved past what the handoff describes, the report says so explicitly.
- `/gps status` gains a one-line signal (`hasHandoff`) so a returning user knows `/gps resume` has something to offer, without changing its existing read-only, all-sessions behavior.
- No new command runs implicitly — both are explicit, user-invoked actions, matching the existing `handoff`/`start-from-last-handoff` precedent.

## Architecture & Approach

### Shared git helpers: `scripts/lib/git.js` (new)

Extracted from `scripts/lib/status.js`:

- `readRecentCommits(projectRoot, sessionDir)` — moved as-is (currently inlined in `lib/status.js`).
- `readGitStatusSummary(projectRoot, sessionDir)` — new. Runs `git status --porcelain -- "<relPath>"` scoped to the session directory, returns the parsed list of `{ path, indexStatus, worktreeStatus }` entries (or `[]` on any error — never throws).

`scripts/lib/status.js` imports `readRecentCommits` from here instead of defining it locally; its behavior is unchanged.

### `scripts/lib/handoff.js` (new) — `buildHandoffData(sessionDir, projectRoot)`

Gathers everything derivable without asking the model anything:

```js
{
  sessionId, featureName, currentPhase,       // from .session-config.json + write-target/ticket-queue logic
  activeTicket,                                // nextPending ticket, or null
  ticketQueueSummary,                          // from listTickets()
  gitLog,                                      // readRecentCommits()
  gitStatus,                                   // readGitStatusSummary()
  timestamp,                                    // ISO now
}
```

`scripts/handoff.js` (thin CLI wrapper, same shape as `status.js`):

1. Resolve current session; error + exit if none.
2. Call `buildHandoffData()`.
3. Load `templates/handoff.md`, render the machine-derivable vars into it, leaving the narrative sections' `{{ }}` placeholders untouched.
4. Write the rendered result to `<sessionDir>/HANDOFF.md`, overwriting any existing file.
5. Print the same data as JSON to stdout, so Claude Code knows what was auto-filled and what still needs narrative content.

Claude Code then edits `HANDOFF.md` directly (same pattern as filling `01-grill/resume.md` for `/gps write`) to fill the remaining placeholders:

- **Where I stopped**
- **Reasoning so far** — approach taken, alternatives tried/rejected, why
- **Next step** — one concrete, specific action
- **Open questions** — anything only the user can resolve
- **Settled decisions (do not re-litigate)**
- **Why uncommitted** — required only if `gitStatus` is non-empty; explains the dirty files

`templates/handoff.md`:

```markdown
# Handoff: {{ feature-name }}

**Session:** {{ session-id }}
**Saved:** {{ timestamp }}
**Current phase:** {{ current-phase }}
**Active ticket:** {{ active-ticket }}

## Where I Stopped

{{ One or two sentences: what were you doing the moment you stopped? }}

## Reasoning So Far

{{ Approach taken, alternatives considered and rejected, and why }}

## Next Step

{{ The exact, concrete action to take first when resuming }}

## Open Questions

{{ Anything blocked on user input, or unresolved choices }}

## Settled Decisions (do not re-litigate)

{{ Choices already made and why }}

## Uncommitted Work

- **Git status:** {{ git-status-summary }}
- **Why not committed:** {{ reason, or "n/a" if git status is clean }}

## Machine State (auto-filled)

- **Ticket queue:** {{ ticket-queue-summary }}
- **Recent commits:** {{ git-log }}
```

### `scripts/lib/resume.js` (new) — `buildResumeReport(sessionDir, projectRoot)`

1. Read `<sessionDir>/HANDOFF.md` if it exists; parse its section bodies (simple heading-delimited split, no markdown parser dependency — consistent with this repo's "no external dependencies" rule).
2. Independently recompute live state the same way `buildHandoffData()` does: ticket queue, git log, git status.
3. Drift check: compare the handoff's `activeTicket`/`currentPhase` against the freshly computed ones. If they differ, include a `drift` field describing what changed (e.g. `"handoff said ticket 3 in-progress; it is now marked done"`).
4. If no `HANDOFF.md` exists, set `handoff: null` and include the same live-state fields `/gps status` would show for the current session, so the command degrades gracefully instead of erroring.

`scripts/resume.js` (thin CLI wrapper): resolves current session, calls `buildResumeReport()`, prints JSON. Read-only — writes nothing.

Claude Code renders the JSON as one chat briefing: handoff narrative (if present) → live facts → drift warning (if any) → suggested next command, using the same next-command logic `/gps status` already uses (grill pending → `/gps write`, tickets pending → `/gps ship`, etc.).

### `/gps status` integration

`buildStatusReport()` in `scripts/lib/status.js` adds `hasHandoff: fs.existsSync(path.join(sessionDir, 'HANDOFF.md'))` to the `current` block. No parsing of the file — existence only. `SKILL.md`'s `/gps status` write-up gains one line: when `hasHandoff` is true, mention `/gps resume` is available for full context.

### Testing

`scripts/lib/git.test.js`, `scripts/lib/handoff.test.js`, `scripts/lib/resume.test.js` — same style as `status.test.js` (construct a temp session dir, assert on the returned data shape, no real git repo required except where git behavior itself is under test using a throwaway repo in a temp dir, matching how existing tests handle `git log`).

## Assumptions & Trade-offs

- `HANDOFF.md` is a single file, overwritten on every `/gps handoff` run — no append-only history. If the session directory is git-tracked, prior checkpoints remain recoverable via `git log`/`git diff` on that file; this feature doesn't need to reimplement that.
- Both commands require an active session; there's no bare/standalone mode. Cross-project or non-gps handoff continues to be the generic `handoff` skill's job.
- Drift detection covers ticket/phase state only (the two things `/gps status` already tracks reliably). It does not diff arbitrary file contents against the handoff's narrative.

## Open Questions

None outstanding — all prior open points (scope, naming, file lifecycle, relationship to `/gps status`) were resolved during brainstorming.

## Notes

Command names: `/gps handoff` (save) and `/gps resume` (catch up), chosen to avoid overlap with `/gps status` (unrelated: all-sessions overview) and with "ticket resume"-style phrasing.

---

## Revision — 2026-09-22 hardening decisions

The feature was implemented as specced above (branch `worktree-handoff-resume`) before the [MVP hardening review](../../reviews/2026-09-22-mvp-hardening-review.md) and its [maintainer decisions](../../reviews/2026-09-22-hardening-decisions.md). Those decisions change the design; this section supersedes the parts of the spec above that it contradicts.

### Already applied (hardening M2)

- **Git scope.** Recent commits are project-wide since the session's `created_at` (max 10), not limited to the session directory — `.work/` is gitignored, so a session-scoped log was always empty. Git status is reported **separately** for the project and for the session directory (`gitStatus: { project, session }`), and `templates/handoff.md` shows both. All git calls use `execFileSync` with an argument array (no shell).
- **Phase.** `currentPhase` comes from `scripts/lib/phase.js`, the same computation `/gps status` uses; `buildHandoffData` also returns `suggestedNext`.
- **Placeholders.** Narrative sections in `templates/handoff.md` use `<!-- gps:fill ... -->` markers instead of `{{ ... }}`.
- **Errors.** Both CLIs go through `runCli` / `resolveSession`: a missing or invalid current session is a one-line error with a recovery hint, never a stack trace.

### Still to do (milestone M4)

1. **Two files.** `/gps handoff` writes `HANDOFF.json` (machine-derived fields: session id, phase, active ticket, ticket queue, git log, git status, timestamp) next to `HANDOFF.md` (narrative only, plus a rendered copy of the machine fields for humans). `/gps resume` reads drift inputs from `HANDOFF.json`, not by parsing Markdown bold-labels.
2. **Backups.** Before overwriting, the previous `HANDOFF.md` / `HANDOFF.json` pair is moved to `handoff-history/HANDOFF-<timestamp>.{md,json}`; at most 10 pairs are kept (oldest deleted first). This replaces "single file, no history" in *Assumptions & Trade-offs*.
3. **Staleness.** `/gps resume` labels the narrative "as of <saved timestamp>" and reports any narrative section still containing a `gps:fill` marker as `unfilledSections`, so an unfinished handoff is never presented as fact.
4. Tests for each of the above, in the existing `scripts/lib/*.test.js` style, plus handler-level cases in `scripts/handlers.test.js`.
