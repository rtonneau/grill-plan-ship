# Session: multi-session-same-repo

**Date:** 2026-11-12T09:46:09.796Z
**Status:** Grill phase complete

## Problem Statement

gps cannot run more than one session on the same repository at once. Every command acts on a single current session, and the session lifecycle assumes it owns the checkout. We want several gps sessions in flight on one repo, each isolated in its own git worktree.

## Context & Constraints

- **Current behavior:** `.work/sessions/.current-session` is one committed pointer (`lib/session-store.js`); `commitWorkDir` stages all of `GPS_WORK_PATHS` including every session dir (`lib/git.js`); saving a plan creates and switches to the session branch (`switchBranch`); small work has no branch and commits on the checked-out branch.
- **Pain point:** a second session in the same checkout overwrites the pointer, gets swept into the other session's `chore(gps)` commits, and the plan-time branch switch moves the other session's work.
- **Dependencies:** keep decisions 0002 (gps commits only its own `.work/` paths), 0012 (session state committed, only `.scratch/` ignored), 0014 (parent commits). Existing sessions and older committed pointers must keep working.
- **Tech stack:** Node.js built-in scripts (CommonJS), git CLI via `lib/git.js`, gh via `lib/github.js`, tests in `tests/`.

## Success Metrics

- `gps start --worktree <name>` creates a linked worktree at `../<repo>-worktrees/<session-id>` (or `--path`) on the session branch, starts the session there, and prints a `Next:` line telling the user to work in it.
- Two sessions started with `--worktree` progress through plan, ship and finish independently; merging both branches into main produces no conflict on `.current-session`.
- `plan` in a worktree session reuses the already checked-out session branch instead of switching.
- Small work in a worktree session: `finish` opens a PR (GitHub) or prints merge steps, and prints the `git worktree remove` command.
- `start` and `status` warn when the current checkout already holds an active unfinished session.
- Tests cover each of the above with real git worktrees; old committed pointers still resolve.

## Architecture & Approach

Isolation is one session per git worktree. `start.js --worktree [--path]` runs `git worktree add -b <session-branch> <path>` (helper in `lib/git.js`) and initializes the session inside the new worktree. `.current-session` stays committed, one per branch; `finish` clears it in its final `chore(gps)` commit so merged branches carry no pointer change. `plan`/`write-apply` detects that the session branch is already checked out and skips the switch. `finish` treats a worktree session with no plan as needing a PR (or merge steps) and prints the worktree removal command. GLOSSARY.md, ADRs and gps-config.json stay shared and are merged by git; this is documented in `docs/WORK-DIR.md` and an ADR records the worktree-per-session decision.

## Assumptions & Trade-offs

- Not supporting several concurrent sessions in a single checkout; that remains one-at-a-time.
- gps never removes a worktree itself; the user runs the printed command.
- Shared project files may conflict at merge; resolved like any file.
- The user (or host) moves into the new worktree; scripts cannot change the agent's cwd.

## Open Questions

- Exact behavior when `--worktree` is used on a non-git or bare repo: refuse with a hint (implementation choice).

## Notes

Grill decisions: worktree isolation; committed per-branch pointer cleared by finish; `gps start --worktree` creates the worktree; plan reuses start's branch; small worktree work gets a PR; shared files merged normally. User chose `/gps auto` after approval.
