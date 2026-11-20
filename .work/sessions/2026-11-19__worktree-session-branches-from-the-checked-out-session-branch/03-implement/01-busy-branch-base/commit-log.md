# Ticket 01: busy-branch-base

**Status:** ✅ Done

## Local Test Result

Ran `node tests/start.test.js && npm test` (log: .scratch/tests/<session>/01-npm-test.log): `start.test.js: all assertions passed`; npm test exit 0, fail 0. The new start.test.js cases failed against the pre-change start.js/git.js (AssertionError on base_branch), then passed.

## Review Notes

Base recorded: b641b1341a5b54beba9bc09af25a3745f862dec5. No pre-existing code changes; an untracked session (2026-11-19__grill-skill-glossary) was already in .work/ and went into the plan's chore(gps) commit (gps commits all of .work/sessions by design).
Checked against the criteria:
- Idle non-default branch `topic` → base topic, HEAD = topic, base_note null.
- Busy branch (a worktree session's own checkout feat/first-wt, its session records base main) → nested worktree at main, base_branch main. The 🌳 line names the busy session.
- Base not recorded / `gone` → ⚠️ naming main (the default branch).
- Config check reads `<base>:` (branch `early` made before init is refused, with nothing created).
- `--json` worktree.base_branch is the base, plus base_note.
`isCommitted` keeps HEAD as its default ref, so its other callers are unchanged. `addWorktree` without a start point behaves as before.

## Blockers / Challenges

None.

## Commits

- 9695135 fix: worktree sessions branch from the busy session's base, not its branch (ticket 01)

## Time Spent

6m (ticket-start.js to ticket-complete.js)
