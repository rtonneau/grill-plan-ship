# Implementation Plan

**Session:** multi-session-same-repo
**Date:** 2026-11-12T09:56:42.542Z
**Estimated effort:** 1-2 days

## Strategy

Build the worktree primitive first (git helper + `start --worktree`), then make the later phases worktree-aware (plan reuses the branch, finish clears the pointer and delivers bounded work), then the guard warnings, then docs and the ADR.

## Tickets Overview

- **Ticket 1:** `start.js --worktree [--path]` creates a linked worktree on the session branch and starts the session inside it.
- **Ticket 2:** saving a plan reuses the session branch already checked out in a worktree session.
- **Ticket 3:** `finish` clears `.current-session` in its last commit, opens a PR (or prints merge steps) for bounded worktree sessions, and prints the `git worktree remove` command.
- **Ticket 4:** `start` and `status` warn when the checkout already holds an active unfinished session.
- **Ticket 5:** docs: WORK-DIR.md, README, start reference, ADR/decision for worktree-per-session.

## Sequencing Rationale

Tickets 2-4 need a worktree session to exist (ticket 1). Docs last, describing the shipped behavior.

## Risks & Mitigation

- **Risk:** Windows path handling for sibling worktree dirs → **Mitigation:** build paths with `path`, test with real `git worktree add` in throwaway dirs.
- **Risk:** clearing the pointer breaks resume after finish on the same branch → **Mitigation:** finish already ends the session; status falls back to listing unfinished sessions; regression test.
- **Risk:** older sessions with a committed pointer → **Mitigation:** read path unchanged; regression test.

## Assumptions

- git >= 2.17 with `git worktree add -b`.
- The agent moves into the new worktree itself; scripts cannot change cwd.
