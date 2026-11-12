# Ticket 02: plan-reuse-branch

**Model:** medium
**Effort:** medium

**Acceptance Criteria:**
- [ ] When the session's config.git.branch is set and is the checked-out branch, write-apply's plan phase skips `createSessionBranch` and keeps the recorded base.
- [ ] The plan's `**Branch:**` value does not rename an existing worktree branch; a mismatch warns.
- [ ] Non-worktree sessions are unchanged.

**Files to Touch:**
- `skills/gps/scripts/write-apply.js`
- `skills/gps/scripts/lib/git.js`
- `tests/write-apply.test.js`

**Verification Step:**

Run:
```bash
node tests/write-apply.test.js
```

Expected:
All tests pass.

**Notes:**

Check how write-apply currently decides to create the branch before changing it.
