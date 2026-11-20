# Implementation Plan

**Session:** worktree session branches from the checked-out session branch instead of the default branch
**Date:** 2026-11-19T13:37:34.355Z
**Estimated effort:** 2-3 hours

## Strategy

First make the default worktree base correct: busy-branch detection, the recorded parent, fallbacks, the start point passed to `git worktree add`, and the config check on the base. Then add the explicit `--base` override and document both.

## Tickets Overview

- **Ticket 1:** `start.js --worktree` cuts its branch from the worktree base: the checked-out branch when idle, the busy session's `base_branch` when busy, with default-branch/HEAD fallbacks. The config check reads the base, and the output reports it.
- **Ticket 2:** `--base <branch>` overrides the worktree base, and the reference and usage strings document the behavior.

## Sequencing Rationale

Ticket 2 plugs an explicit value into the base resolution that ticket 1 builds. Each leaves `npm test` passing.

## Risks & Mitigation

- **Risk:** `git worktree add` with a start point behaves differently for a remote-only name. → **Mitigation:** resolve the base to an existing local branch (`refs/heads/<base>`) and refuse otherwise.
- **Risk:** older session configs lack `git.base_branch`. → **Mitigation:** fall back to the default branch, then HEAD, with a ⚠️ line, and cover it with a test that simulates the old config.

## Assumptions

- A branch is checked out in only one worktree, so the checkout's own `.work/sessions` is enough to detect a busy branch.
- No fetch: only local branches are used.
