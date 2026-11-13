# Ticket 01: ticket-state

**Model:** medium
**Effort:** medium

**Acceptance Criteria:**
- [ ] `ticket-start.js N` on a ticket whose latest `ticket_blocked` has no later `ticket_resumed`/`ticket_done`/`session_finished` records a `ticket_resumed` event (`detail.ticket`), and records nothing extra otherwise; `ticket_started` is still recorded once.
- [ ] A pure helper (`lib/ticket-state.js`) takes the ticket list and the session history and returns, per ticket, `state` (`done` when the log reads Done, else `blocked` with an open block, else `started` when the commit log exists or a `ticket_started` event exists, else `pending`) and `blocker` (`{ reason, at }` or null).
- [ ] Tests cover pending → started → blocked → resumed (started) → done, a block closed by `session_finished`, and a log set to Done by hand while a block is open.

**Files to Touch:**
- `skills/gps/scripts/lib/ticket-state.js`
- `skills/gps/scripts/ticket-start.js`
- `tests/lib/ticket-state.test.js`
- `tests/ticket-start.test.js`

**Verification Step:**

Run:
```bash
node tests/lib/ticket-state.test.js && node tests/ticket-start.test.js && npm test
```

Expected:
All tests pass, including the new resume and state cases.

**Notes:**

`ticket-block.js` writes `ticket_blocked` with `detail { ticket, reason }`; history order is append order. Use `getHistory(config)` from `lib/history.js` so backfilled sessions work. Keep the helper free of file reads beyond what it is given, so status.js and tests can share it.
