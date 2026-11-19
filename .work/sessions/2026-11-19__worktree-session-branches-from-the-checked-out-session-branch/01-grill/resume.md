# Session: worktree session branches from the checked-out session branch instead of the default branch

**Date:** 2026-11-19T13:23:44.617Z
**Status:** Grill phase complete

## Problem Statement

`/gps start --worktree` cuts the new session branch from the main checkout's HEAD. When that checkout is on another unfinished session's branch, the new worktree session stacks on it: it records that branch as `base_branch`, and its pull request targets it instead of the branch the other session came from.

## Context & Constraints

- **Current behavior:** `addWorktree` (`skills/gps/scripts/lib/git.js`) runs `git worktree add -q -b <branch> <path>` with no start point, so the branch starts at HEAD, and `sessionBaseBranch` records the checked-out branch as `base_branch`. Reproduction: run `/gps plan` in the main checkout (it switches to `feat/a`), then `/gps start --worktree b`. The result is `feat/b`, reported "from feat/a". The `.work/gps-config.json is committed` check in `start.js` also reads `HEAD`.
- **Pain point:** parallel worktree sessions, the point of `--worktree`, silently stack on whatever session the main checkout is running. Their PRs target the wrong branch.
- **Dependencies:** keep today's behavior when the checked-out branch is idle, so branching from a non-default branch that no session uses still works. The plan-save `git switch -c` path without `--worktree` is unchanged.
- **Tech stack:** Node.js built-ins, git via `lib/git.js` (`execFileSync` with argument arrays), tests in `tests/start.test.js` using `tests/helpers.js`.

## Success Metrics

- Idle checked-out branch (no busy session): the worktree branch starts from it and records it as `base_branch`, as today.
- Busy checked-out branch: the worktree branch starts from the busy session's recorded `base_branch` and records it. Output names the base and the session that made the branch busy.
- `--base <branch>` (needs `--worktree`) starts from that branch and records it. A base branch that doesn't exist is refused with nothing created.
- If the busy session's `base_branch` is missing or no longer exists locally, the default branch is used (`defaultBranch()`), else HEAD. Either way a ⚠️ line names the branch used and why.
- The `gps-config.json` committed check reads the worktree base, not HEAD.
- The `🌳` line and `start.js --json` report the chosen base. Tests cover each case above.

## Architecture & Approach

Resolve the **worktree base** in `start.js` / `lib/git.js` before creating anything:
1. `--base` if given.
2. Otherwise the checked-out branch, unless it is a **busy branch**: an unfinished session in this checkout's `.work/sessions` records it as `git.branch`. In that case, use that session's `git.base_branch`.
3. Fallbacks with a warning: the default branch, then HEAD.

Pass the base as the start point: `git worktree add -q -b <branch> <path> <base>`. Record it as `base_branch`. Check `<base>:.work/gps-config.json` instead of `HEAD:`. Update the `start.md` reference and the usage strings for `--base`.

## Assumptions & Trade-offs

- Only one level up: the busy session's recorded `base_branch` is used as is, even if that is itself a session branch.
- A session still in the grill has no branch, so it never makes a branch busy.
- Only the local branch is used: no fetch, and `origin/<default>` is not considered.
- Not doing: changing plan-save branching without `--worktree`, or detecting sessions that run in other worktrees (a branch is checked out in only one worktree, so the checkout's own sessions are enough).

## Open Questions

None.

## Notes

Glossary terms added: Busy branch, Worktree base. No ADR: the behavior is easy to change later.
