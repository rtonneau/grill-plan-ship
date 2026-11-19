# Ticket 01: busy-branch-base

**Model:** medium
**Effort:** high

**Acceptance Criteria:**
- [ ] Idle checked-out branch (including a non-default one): the worktree branch starts at it, and `base_branch` is that branch.
- [ ] Busy checked-out branch (an unfinished session in the checkout has it as `git.branch`): the worktree branch starts at that session's `git.base_branch` and records it. Output names the base and the busy session.
- [ ] Busy session with a missing or non-existent local `base_branch`: the default branch is used, else HEAD, with a ⚠️ line naming the branch and why.
- [ ] The `.work/gps-config.json` committed check reads `<base>:` instead of `HEAD:`.
- [ ] The `🌳` line shows the base, and `start.js --json` `worktree.base_branch` holds it.

**Files to Touch:**
- `skills/gps/scripts/start.js`
- `skills/gps/scripts/lib/git.js`
- `tests/start.test.js`

**Verification Step:**

Run:
```bash
node tests/start.test.js && npm test
```

Expected:
All tests pass, including new cases for an idle non-default branch, a busy branch, the missing-base fallback, and the config check on the base.

**Notes:**

`addWorktree` currently runs `git worktree add -q -b <branch> <path>` and records `sessionBaseBranch(projectRoot)`. Give it an explicit base and append that as the start point. Use `listUnfinishedSessions` / `readConfigOrNull` from `lib/session-store.js` to find the busy session. Keep `isCommitted`'s callers working: add a ref parameter or a separate helper. Build fixtures through the scripts. To simulate an older config, edit `.session-config.json` only for that case.
