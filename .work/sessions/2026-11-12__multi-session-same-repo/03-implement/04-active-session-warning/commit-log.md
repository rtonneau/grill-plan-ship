# Ticket 04: active-session-warning

**Status:** ✅ Done

## Local Test Result

`node tests/start.test.js && node tests/status.test.js` → both: all assertions passed

## Review Notes

Base 50acc9da317fbcd0799d2e7b7d8dad96be6d5702. Inline. start (no --worktree) warns when the pointer names an unfinished session, suggesting --worktree; status adds "Sessions in other worktrees" (from git worktree list + each worktree pointer) before Next:, and data.worktrees. Warnings only. Added lib/git.js listWorktrees. lib/status.js left unchanged (rendering appended in status.js).

## Blockers / Challenges

Shell/python escaping mangled \n and \r in two edited lines; repaired byte-wise.

## Commits

- 53745db feat: warn about unfinished sessions and list other worktrees' sessions (ticket 04)

## Time Spent

3m (ticket-start.js to ticket-complete.js)
