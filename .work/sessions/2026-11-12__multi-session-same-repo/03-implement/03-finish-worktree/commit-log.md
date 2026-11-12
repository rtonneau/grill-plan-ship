# Ticket 03: finish-worktree

**Status:** ✅ Done

## Local Test Result

`node tests/finish.test.js && node tests/github-flow.test.js` → both: all assertions passed (also start and write-apply tests re-run: pass)

## Review Notes

Base 4b416f0f228a1fb9e0e34726a82f676a6cff90cf. Inline. finish already deleted .current-session before its chore(gps) commit (add -A records the deletion), so criterion 1 needed only the test. Added: worktree sessions push + PR only on GitHub projects, otherwise print merge steps; never switch branch in a worktree; print `git worktree remove <path>` (never run); INDEX Branch section handles no PR and lists the worktree. Test: two parallel worktree sessions, small work, finish both, merge both into main with no conflict. Scope addition from ticket 1: --worktree now refuses unless .work/gps-config.json is committed (git refuses to merge over an untracked copy, and per-worktree configs conflict on detected_at); tests run init --apply first.

## Blockers / Challenges

The merge test found two real conflicts: per-worktree gps-config.json (timestamps differ) and an untracked one in the main checkout. Fixed by requiring /gps init before --worktree.

## Commits

- 684128f feat: finish delivers worktree sessions without switching branch (ticket 03)

## Time Spent

10m (ticket-start.js to ticket-complete.js)
