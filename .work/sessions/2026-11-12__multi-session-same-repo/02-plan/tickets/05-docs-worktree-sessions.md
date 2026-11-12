# Ticket 05: docs-worktree-sessions

**Model:** fast
**Effort:** low

**Acceptance Criteria:**
- [ ] `docs/decisions/NNNN-worktree-per-session.md` records the decision and its reasons.
- [ ] `docs/WORK-DIR.md` documents the per-branch pointer and shared files merged by git.
- [ ] `skills/gps/references/start.md` and SKILL.md command table mention `--worktree`; README documents running parallel sessions.
- [ ] `npm test` and `node tests/check-skill-size.js --max 200` pass.

**Files to Touch:**
- `docs/decisions/`
- `docs/WORK-DIR.md`
- `skills/gps/references/start.md`
- `skills/gps/SKILL.md`
- `README.md`

**Verification Step:**

Run:
```bash
npm test
```

Expected:
All tests pass.

**Notes:**

Keep start.md ≤ 40 lines.
