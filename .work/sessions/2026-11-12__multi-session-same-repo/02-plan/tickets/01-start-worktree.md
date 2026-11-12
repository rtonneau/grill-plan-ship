# Ticket 01: start-worktree

**Model:** heavy
**Effort:** high

**Acceptance Criteria:**
- [ ] `start.js --worktree "<name>"` runs `git worktree add -b <session-branch> ../<repo>-worktrees/<session-id>` and initializes the session there (session dir, pointer, config.git with branch and base_branch).
- [ ] `--path <dir>` overrides the location; an existing path or branch is refused with a hint and nothing is written.
- [ ] Output ends with a `Next:` line telling the agent to work in the worktree path.
- [ ] Refused outside a git work tree.
- [ ] Without `--worktree`, behavior is unchanged.

**Files to Touch:**
- `skills/gps/scripts/start.js`
- `skills/gps/scripts/lib/git.js`
- `skills/gps/scripts/lib/session-init.js`
- `tests/start.test.js`

**Verification Step:**

Run:
```bash
node tests/start.test.js
```

Expected:
All tests pass, including new worktree cases.

**Notes:**

Add `addWorktree(projectRoot, path, branch)` to lib/git.js using execFileSync args. Branch name: derive like plan's session branch naming, or `gps/<slug>` if plan normally names it later; plan must accept it (ticket 2).
