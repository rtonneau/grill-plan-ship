# Ticket 02: base-flag

**Model:** fast
**Effort:** medium

**Acceptance Criteria:**
- [ ] `start.js --worktree --base <branch>` starts the worktree branch at `<branch>` and records it as `base_branch`, even when the checked-out branch is busy.
- [ ] `--base` without `--worktree` is a usage error (exit 2). A `--base` naming a branch that doesn't exist locally is refused with nothing created (exit 1).
- [ ] `start.js` usage strings and `skills/gps/references/start.md` document `--base` and the worktree-base rule. The SKILL.md command table lists the flag.

**Files to Touch:**
- `skills/gps/scripts/start.js`
- `skills/gps/references/start.md`
- `skills/gps/SKILL.md`
- `tests/start.test.js`

**Verification Step:**

Run:
```bash
npm test && node tests/check-skill-size.js --max 200
```

Expected:
All tests pass, and the size check passes.

**Notes:**

Keep `start.md` at or under 40 lines. Validate `--base` in the same pre-creation problem list as `--branch` and `--path`, so nothing is created on failure.
