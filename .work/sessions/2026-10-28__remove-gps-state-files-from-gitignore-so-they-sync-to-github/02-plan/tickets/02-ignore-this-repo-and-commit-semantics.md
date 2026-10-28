# Ticket 02: ignore-this-repo-and-commit-semantics

**Model:** medium
**Model (Jev):** sonnet-5.5 (confidence 0.3)
**Effort:** high

**Acceptance Criteria:**
- [ ] The four lines are gone from this repo's `.gitignore` (`.scratch/` stays).
- [ ] Comments in `lib/git.js`, `start.js`, `lib/session-init.js`, `lib/seeds-store.js` and `lib/clean.js` no longer say these files are git-ignored.
- [ ] A test in `tests/lib/git.test.js` shows `commitWorkDir` commits `.current-session`, the seeds file and both payloads when they are not ignored.

**Files to Touch:**
- `.gitignore`
- `skills/gps/scripts/lib/git.js`
- `skills/gps/scripts/start.js`
- `skills/gps/scripts/lib/session-init.js`
- `tests/lib/git.test.js`

**Verification Step:**

Run:
```bash
npm test
```

Expected:
all tests pass.

**Notes:**

`commitWorkDir` needs no code change, only its comment and the new test.
