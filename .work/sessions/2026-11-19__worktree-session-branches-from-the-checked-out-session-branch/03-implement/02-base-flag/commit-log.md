# Ticket 02: base-flag

**Status:** ✅ Done

## Local Test Result

Ran `npm test && node tests/check-skill-size.js --max 200` (log: .scratch/tests/<session>/02-npm-test.log): pass 144, fail 0. The size check reports SKILL.md 78 lines (max 200). start.md is 32 lines.

## Review Notes

Base recorded: 5a56647d275d3da6a16f8e01ea8a87c851fbcafd. No pre-existing changes.
Checked against the criteria:
- `--base feat/first-wt` from a busy worktree stacks on it: base_branch recorded, HEAD matches.
- `--base nope` → exit 1 "is not a local branch", no branch created.
- `--base` without `--worktree` → exit 2.
- Docs: start.md step, SKILL.md table entry, usage strings. Also updated the README worktree paragraph (not in Files to Touch, but it documents the same behavior).
Decision 0017 is left as the historical record.

## Blockers / Challenges

None.

## Commits

- d309ebc feat: start --worktree --base stacks a session on a chosen branch (ticket 02)

## Time Spent

4m (ticket-start.js to ticket-complete.js)
