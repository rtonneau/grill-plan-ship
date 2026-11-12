# Ticket 01: start-worktree

**Status:** ✅ Done

## Local Test Result

`node tests/start.test.js` → start.test.js: all assertions passed

## Review Notes

Base 151bde5733a757d074bb19f90c4d553343fb1fb7, clean tree. Inline. Checked each criterion: worktree at ../<repo>-worktrees/<id> on feat/<slug> (fix/ for --issue), session + pointer + config.git (branch, base_branch, worktree_path) inside it, branch_created event; --path/--branch overrides; existing path/branch and non-git refused before writing; main checkout untouched; no-flag path unchanged (existing tests pass). Added lib/git.js worktreeProblems, addWorktree, worktreeRoot, isLinkedWorktree.

## Blockers / Challenges

A heredoc edit turned \n escapes into newlines; fixed. Seeds in an uncommitted main-checkout .pending-seeds.json are not seen from the new worktree (accepted: seeds are committed).

## Commits

- 85339ef feat: gps start --worktree runs a session in its own git worktree (ticket 01)

## Time Spent

2m (ticket-start.js to ticket-complete.js)
