# Session history design

**Date:** 2026-09-25
**Status:** Approved

## Goal

Every `.session-config.json` records the life of its session: when it started,
every step that changed its state, the phase it is in, and which `.md` files
each step produced or touched. From that file alone one can build a timeline
of the session, and `/gps finish` renders that timeline into `INDEX.md`.

## Decisions

| Question | Decision |
|---|---|
| How is the current phase stored? | `current_phase` in the config, set by every recorded event. Files stay the source of truth: `/gps status` still derives the phase from files and reports `phaseDrift` when the two differ. |
| What is the history? | An append-only `history` array of events. `usage` is unchanged. |
| What phase does an event carry? | The phase after the command that recorded it, in the labels `phase.js` already derives (`grill`, `plan-not-started`, `plan`, `ship`, `finish-pending`, `plan-complete`, `finished`). |
| How do exact ticket-done times get in? | New `ticket-done.js <N>`, called by the ship/ticket instructions right after the Status line is set to Done. |
| Who renders the timeline? | `/gps finish`, as a `## Timeline` table in `INDEX.md`. No new command. |
| Sessions created before this? | Backfilled from stored timestamps only (`created_at`, `usage.*.startedAt`, `finished_at`), flagged `backfilled: true`. No file-mtime guesses. |
| Version | Ships in 1.4.0 together with the GitHub config/issue work (neither is released yet). |

## Config shape

```json
{
  "session_id": "2026-09-25__dark-mode",
  "feature_name": "Dark mode",
  "created_at": "2026-09-25T09:02:11.000Z",
  "usage": { "...": "unchanged" },
  "current_phase": "ship",
  "history": [
    { "at": "2026-09-25T09:02:11.000Z", "event": "session_started", "phase": "grill",
      "files": ["01-grill/resume.md"] },
    { "at": "2026-09-25T09:31:40.000Z", "event": "grill_written", "phase": "plan-not-started",
      "files": ["01-grill/resume.md"] },
    { "at": "2026-09-25T10:40:02.000Z", "event": "ticket_done", "phase": "ship",
      "files": ["03-implement/01-toggle/commit-log.md"], "detail": { "ticket": "01-toggle" } }
  ]
}
```

- `at`: ISO 8601. `event`: one of the names below. `phase`: see above.
- `files`: paths relative to the session directory, forward slashes, so they
  keep working when the session directory is moved or archived. Optional.
- `detail`: small flat object of facts specific to the event. Optional.
- `backfilled: true` on reconstructed events.

## Events

| event | recorded by | files | detail |
|---|---|---|---|
| `session_started` | `initSession` (`/gps start`, `/gps issue`) | `01-grill/resume.md` | `kind` when `issue` |
| `grill_written` | `write-apply.js`, grill | `01-grill/resume.md` | |
| `plan_started` | `plan.js` | `02-plan/plan.md` | |
| `plan_written` | `write-apply.js`, plan | `02-plan/plan.md` + each ticket file | `tickets` (count) |
| `ticket_started` | `ticket.js`, first run per ticket | ticket spec, `commit-log.md` | `ticket` (`NN-<slug>`) |
| `ticket_done` | `ticket-done.js` | `commit-log.md` | `ticket` |
| `handoff_saved` | `handoff.js` | `HANDOFF.md` | |
| `session_finished` | `finish.js` | `INDEX.md` | |

`/gps status`, `/gps resume`, `write-target.js` and `ticket-queue.js` are
read-only for history and record nothing. The GitHub work adds
`branch_created`, `issue_created`, `pr_opened`, `issue_commented` and
`issue_closed` through the same `recordEvent` (see that plan).

## `scripts/lib/history.js`

- `recordEvent(configPath, config, sessionDir, { event, files, detail, at })`:
  1. `ensureHistory(config)`: creates `config.history` (backfilled) when missing.
  2. Appends `{ at: at || now, event, phase, files, detail }`, omitting empty
     `files`/`detail`. `phase` comes from
     `computeSessionState(sessionDir, config).phase`, so it uses the derived
     vocabulary by construction.
  3. Sets `config.current_phase = phase` and writes the config atomically.
  Never throws: on any error it prints
  `⚠️  Session history not recorded: <reason>` to stderr and returns false, so
  history can never block a command. Callers record after their files are
  written. Within one command every event gets the phase as it stands after
  the command, while `at` reflects the real order of the actions (callers pass
  `at` for events whose action happened earlier in the command).
- `getHistory(config) -> event[]`: `config.history` or its backfilled view,
  without mutating.
- `backfillHistory(config) -> event[]`: `session_started` at `created_at`;
  `plan_started` at `usage.plan.startedAt`; `ticket_started` at each
  `usage.03-NN-<slug>.startedAt` (detail `ticket: "NN-<slug>"`);
  `session_finished` at `finished_at`. Fixed phases: `grill`, `plan`, `ship`,
  `finished`. Every event has `backfilled: true`. Sorted by `at`. A session
  with nothing stored gets just `session_started`.
- `renderTimeline(events) -> string[]` (markdown lines): a `## Timeline` table
  with columns `When` (local `YYYY-MM-DD HH:MM`), `Phase`, `Event`, `Details`
  (`key: value` pairs, plus `(reconstructed)` for backfilled events) and
  `Files` (relative markdown links, `[path](path)`).

## `ticket-done.js <N>`

- Resolves the ticket like `ticket.js` does. The lookup moves from
  `ticket.js` into `scripts/lib/ticket-queue.js` as
  `findTicketByNumber(sessionDir, number)` so both handlers share it.
- Fails (`❌`, nothing changed) unless the plan is written, the ticket exists,
  and its `commit-log.md` says exactly `**Status:** ✅ Done`. Hint: set the
  Status line first, then run this again.
- Idempotent: if a `ticket_done` event for that ticket exists, it prints
  `✅ Ticket NN (<slug>) was already recorded as Done; nothing was changed.`
- Otherwise records `ticket_done` and prints `✅ Ticket NN (<slug>) recorded as Done.`
- `references/ship.md` (inline mode, and the subagent's command list next to
  the `token-usage.js` line) and `references/ticket.md` add the exact command
  `node $CLAUDE_PLUGIN_ROOT/scripts/ticket-done.js <N>` after the Status line
  is set and before the commit.

## Status and drift

`summarizeSession` adds `currentPhase` (recorded, `null` for sessions without
one) and `phaseDrift`: `{ recorded, derived }` when `current_phase` is set and
differs from the derived `phase`, else `null`. `references/status.md` tells
Claude to mention drift and how to resolve it (usually a missing
`ticket-done.js`). `status.js` stays read-only.

## Finish and `INDEX.md`

`finish.js` builds the timeline from
`[...getHistory(config), <session_finished event at finishedAt>]` and inserts
`## Timeline` (via `renderTimeline`) before `## Next`, so INDEX.md is written
before the config is marked finished, as today. After INDEX.md is written it
records `session_finished` with the same `at`. Backfill therefore also covers
old sessions closed with the new version.

## Files

New: `scripts/lib/history.js` (+ test), `scripts/ticket-done.js`.
`ticket-done.js` is not a `/gps` command: it is documented inside `ship.md`
and `ticket.md` (like `token-usage.js`), so `SKILL.md` and the router test are
unchanged.

Changed: `scripts/lib/session-init.js` (or `start-session.js` before the GitHub
refactor lands), `scripts/write-apply.js`, `scripts/plan.js`,
`scripts/ticket.js`, `scripts/handoff.js`, `scripts/finish.js`,
`scripts/lib/ticket-queue.js`, `scripts/lib/status.js`,
`skills/gps/references/ship.md`, `ticket.md`, `status.md`, `README.md`,
`CLAUDE.md`.

## Error handling

- History failures never fail a command (warning only).
- `ticket-done.js` on a ticket not marked Done, an unknown number, or a
  session without a written plan: `❌` with a hint, nothing changed.
- A corrupt `history` (not an array): treated as missing; the next
  `recordEvent` replaces it with a backfilled history and warns once.

## Testing

- `history.test.js`: append + phase derivation from a temp session; `at`
  override; empty `files`/`detail` omitted; backfill from a legacy config
  (created, plan, two tickets, finished) with `backfilled` and sorted order;
  backfill of a bare config; corrupt `history` replaced; never throws (an
  unwritable config path returns false and warns); `renderTimeline` rows,
  links and `(reconstructed)`.
- `ticket-done.js` (in `handlers.test.js`): refused while Status is In
  Progress; records once and is idempotent; unknown ticket; no plan yet.
- `e2e.test.js`: the full flow start → write → plan → write → ticket ×2 (with
  `ticket-done.js`) → handoff → finish records the events in order, keeps
  `current_phase` equal to the derived phase after each step, and INDEX.md has
  a `## Timeline` whose links all point at existing files.
- Drift: after marking a ticket Done without `ticket-done.js`, `status.js`
  reports `phaseDrift`; running `ticket-done.js` clears it.
- A session config without `history` (legacy) gets the backfilled events plus
  the new one on its next command.
- Existing tests keep passing unchanged.
