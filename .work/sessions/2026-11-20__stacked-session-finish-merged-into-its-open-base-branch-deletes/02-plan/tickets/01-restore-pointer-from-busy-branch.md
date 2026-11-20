# Ticket 01: restore-pointer-from-busy-branch

**Model:** medium
**Effort:** medium

**Acceptance Criteria:**
- [ ] With no `.current-session` and exactly one unfinished session whose `git.branch` equals the checked-out branch, `resolveCurrentPointer` writes the pointer to that session, warns `⚠️` naming it and why, and returns it with no problem.
- [ ] Zero or several matching sessions, a detached HEAD, or a non-git project: unchanged `no-pointer` behavior.
- [ ] Invalid, missing-session and finished pointers are never replaced.
- [ ] `tests/finish.test.js` gains the stacked case: A in a worktree with plan saved, B stacked with `--base` on A's branch, B finished, B merged into A; `status.js` in A then shows A as current and `.current-session` holds A.
- [ ] A unit test in `tests/lib/` covers the zero/several-match and finished-pointer cases.
- [ ] `docs/decisions/0017-*.md` (parallel sessions) gets a Consequences line on the restore, pointing at ADR 0002.

**Files to Touch:**
- `skills/gps/scripts/lib/session-store.js`
- `tests/finish.test.js`
- `tests/lib/session-store.test.js`
- `docs/decisions/0017-parallel-sessions-run-one-per-git-worktree.md`

**Verification Step:**

Run:
```bash
npm test
```

Expected:
All test files pass, including the new stacked-merge case in finish.test.js.

**Notes:**

Check `lib/git.js` for `currentBranch` before adding a helper; avoid a require cycle between session-store and git (session-store already imports `branchesHolding`). Warnings go through `warn()` from `lib/cli.js`. Use `setCurrentSession` to write. The repro script is in `.scratch/repro/stacked.js`. Check the actual 0017 filename (two decisions share the number).
