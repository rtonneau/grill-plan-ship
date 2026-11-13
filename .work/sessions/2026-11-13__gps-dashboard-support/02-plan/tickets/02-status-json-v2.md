# Ticket 02: status-json-v2

**Model:** medium
**Effort:** high

**Acceptance Criteria:**
- [ ] `status.js --json` has top-level `schemaVersion: 2` and `gpsVersion` (the `version` of `<skill>/../../plugin.json`, null when missing or unreadable).
- [ ] `current.tickets[]` and `current.nextPending` carry `state` and `blocker` and no `done`; all other ticket fields are unchanged.
- [ ] `current.recentEvents` lists the last 10 history events as `{ at, event, phase, detail }` (detail null when absent).
- [ ] With no `.work/sessions`, or with no sessions and no seeds, `status.js --json` exits 0 with `{ schemaVersion, gpsVersion, sessions: [], seeds: [], current: null, currentProblem: { code: 'no-work-dir' | 'no-sessions', message, hint }, worktrees }`; text mode still prints `❌ No sessions found.` and exits 1.
- [ ] Text output counts done tickets as before and lists each blocked ticket with its reason.

**Files to Touch:**
- `skills/gps/scripts/status.js`
- `skills/gps/scripts/lib/status.js`
- `skills/gps/scripts/lib/plugin-version.js`
- `tests/status.test.js`
- `tests/lib/plugin-version.test.js`

**Verification Step:**

Run:
```bash
node tests/status.test.js && npm test
```

Expected:
All tests pass, including v2 shape, empty-project JSON and blocked-ticket text cases.

**Notes:**

The version helper exports `SCHEMA_VERSION = 2` and `gpsVersion()`; ticket 3 reuses both. Build blocked sessions through `ticket-start.js`/`ticket-block.js` in tests, not by writing history by hand.
