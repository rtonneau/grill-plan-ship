# Ticket 01: start-resumes-unfinished

**Model:** heavy
**Model (Jev):** opus-5.5 (confidence 0.3)
**Effort:** high

**Acceptance Criteria:**
- [ ] `start.js <name>` finds unfinished sessions whose id slug part (after `YYYY-MM-DD__`) equals the cleaned slug, any date, and picks the newest by `created_at`.
- [ ] On a match it exits 0 and writes nothing (no dir, no history event, no `.current-session` change, no seed consumed, no .gitignore edit). It prints a short summary: `↩️ Session <id> already exists and is not finished.`, phase, tickets x/y (when any), last activity / idle days, whether it is the current session, then `Next: <suggestedNext.command>`.
- [ ] `--json` data includes `resumable: true`, `sessionId`, `phase`, `isCurrent`, `suggestedNext`, `kind`.
- [ ] `--issue` against a feature session, or no `--issue` against an issue session, warns via `warn()` that the existing kind is kept.
- [ ] A finished session with today's id still fails (exit 1), with a hint to pick a different feature name and no mention of `/gps status`. A finished session with the same slug on another day does not block creating today's session.
- [ ] Tests: same-day resume, cross-day resume (newest of several), finished same-day collision, finished other-day creation, kind mismatch warning, nothing written on resume.

**Files to Touch:**
- `skills/gps/scripts/start.js`
- `skills/gps/scripts/lib/session-store.js` (helper `findUnfinishedBySlug`)
- `skills/gps/scripts/lib/session-init.js` (hint text, optional `now` argument)
- `tests/start.test.js`, `tests/lib/session-store.test.js`, `tests/lib/session-init.test.js`

**Verification Step:**

Run:
```bash
node --test tests/start.test.js tests/lib/session-store.test.js tests/lib/session-init.test.js
```

Expected:
All tests pass, 0 failures.

**Notes:**

Reuse `computeSessionState` (`lib/phase.js`) and `computeIdleness` (`lib/staleness.js`). Do the lookup before `initSession`, and before anything that writes (seed removal, .gitignore). For cross-day tests, add an optional `now` argument to `initSession` (default `new Date()`) and create the older sessions through it; never write session state by hand. Finish older sessions through the scripts (or `finish.js` in a test helper) rather than editing `finished_at`; check `tests/helpers.js` and existing finish tests for a helper first.
