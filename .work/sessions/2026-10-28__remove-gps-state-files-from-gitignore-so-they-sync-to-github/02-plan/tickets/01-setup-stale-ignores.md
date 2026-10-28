# Ticket 01: setup-stale-ignores

**Model:** medium
**Model (Jev):** sonnet-5.5 (confidence 0.41)
**Effort:** high

**Acceptance Criteria:**
- [ ] `LOCAL_ONLY` in `lib/setup.js` holds only `.scratch/`; a `STALE_IGNORES` list holds the four removed entries.
- [ ] `inspectSetup` reports a project as not ready while any stale entry is in `.gitignore`.
- [ ] `applySetup` strips exactly those lines with `removeGitignoreEntry`, returns them, and commits the change with the setup commit; other `.gitignore` edits stay untouched.
- [ ] `/gps init` output reports the removal; `/gps start` never removes them and no longer writes them.

**Files to Touch:**
- `skills/gps/scripts/lib/setup.js`
- `skills/gps/scripts/init.js`
- `tests/lib/setup.test.js`
- `tests/init.test.js`

**Verification Step:**

Run:
```bash
node tests/lib/setup.test.js && node tests/init.test.js
```

Expected:
all tests pass.

**Notes:**

Add a test with stale lines plus an unrelated user `.gitignore` edit. Update any other test that expects the four lines (grep `tests/` for `.current-session`).
