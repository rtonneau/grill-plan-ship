# Ticket 04: active-session-warning

**Model:** fast
**Effort:** medium

**Acceptance Criteria:**
- [ ] `start.js` (without `--worktree`) warns via `warn()` when the checkout's current session is unfinished, suggesting `--worktree`.
- [ ] `status.js` notes when unfinished sessions other than the current one exist and whether they live in other worktrees (`git worktree list`).

**Files to Touch:**
- `skills/gps/scripts/start.js`
- `skills/gps/scripts/status.js`
- `skills/gps/scripts/lib/status.js`
- `tests/start.test.js`
- `tests/status.test.js`

**Verification Step:**

Run:
```bash
node tests/start.test.js && node tests/status.test.js
```

Expected:
All tests pass.

**Notes:**

Warnings only; never refuse.
