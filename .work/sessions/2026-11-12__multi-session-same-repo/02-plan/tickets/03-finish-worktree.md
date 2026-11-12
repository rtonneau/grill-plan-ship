# Ticket 03: finish-worktree

**Model:** heavy
**Effort:** high

**Acceptance Criteria:**
- [ ] finish removes `.work/sessions/.current-session` in its final `chore(gps)` commit when it points at the finished session.
- [ ] A bounded session started with `--worktree` opens a PR on GitHub projects, or prints merge steps otherwise.
- [ ] In a linked worktree, finish prints `git worktree remove <path>` and never runs it.
- [ ] Merging two finished worktree session branches into main produces no conflict on `.current-session` (test).

**Files to Touch:**
- `skills/gps/scripts/finish.js`
- `skills/gps/scripts/lib/session-store.js`
- `tests/finish.test.js`
- `tests/github-flow.test.js`

**Verification Step:**

Run:
```bash
node tests/finish.test.js && node tests/github-flow.test.js
```

Expected:
All tests pass.

**Notes:**

Use the stub gh (`GPS_GH_BIN`) for the PR case.
