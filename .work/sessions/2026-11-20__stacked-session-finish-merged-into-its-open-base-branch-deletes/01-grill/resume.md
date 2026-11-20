# Session: stacked session finish merged into its open base branch deletes the base session pointer

**Date:** 2026-11-20T07:46:41.267Z
**Status:** Grill phase complete

## Problem Statement

A session stacked with `start --worktree --base <branch>` on an open session's branch deletes `.work/sessions/.current-session` in its finish commit. Merging the stacked branch back into the open session's branch applies that deletion without a conflict, so the open session silently loses its pointer: every later command in its checkout fails with "No current session is selected."

The originally reported bug (the committed pointer conflicting when parallel session branches merge) is no longer present: `finish.js` clears the pointer in its final `chore(gps)` commit (decision 0017), `tests/finish.test.js` merges two finished worktree sessions into main without conflict, and a live reproduction confirmed that main never carries a committed pointer in the normal flow.

## Context & Constraints

- **Current behavior:** Reproduction: `init.js --apply`; `start.js first --worktree`; save grill and plan in that worktree (pointer `first` committed on `feat/first`); from it `start.js second --worktree --base feat/first`; small work, commit, `finish.js` in the second worktree; in the first worktree `git merge --no-ff feat/second`. The merge exits 0, `.current-session` is gone from the first worktree, and `status.js` shows no current session.
- **Pain point:** The open session's pointer is lost without any signal at merge time; recovery needs a manual `set-current.js first --confirmed`.
- **Dependencies:** Keep decision 0012 (pointer committed), 0017 (finish deletes the pointer), and the refusals of `resolveCurrentPointer` (`lib/session-store.js`) for invalid, missing-session and finished pointers. The term "busy branch" (glossary) names the match.
- **Tech stack:** Node.js built-ins, CommonJS scripts under `skills/gps/scripts/`, tests in `tests/` driven through the real scripts.

## Success Metrics

- After the reproduction above, the next gps command in the first worktree points back to `first` by itself, writes `.current-session`, and prints a `⚠️` warning naming the restored session.
- With no pointer and zero or several unfinished sessions making the checked-out branch busy, the behavior and error are unchanged.
- An invalid, missing-session or finished pointer still fails as today; nothing is restored.
- A regression test next to the parallel-merge case in `tests/finish.test.js` covers the stacked merge and the restore; `npm test` passes.

## Architecture & Approach

When `.current-session` is missing (the `no-pointer` case only) and exactly one unfinished session records the checked-out branch as its `git.branch` (it makes that branch busy), pointer resolution re-points to that session: it writes the pointer and warns. This loosens "never falls back to another session" for one unambiguous case, recorded as ADR 0002 (`.work/adr/0002-pointer-restored-from-checked-out-branch.md`). It works however the merge happened: locally, or via a pull request merged on GitHub and pulled.

## Assumptions & Trade-offs

- The checked-out branch identifies its owning session without ambiguity; with several candidates nothing is restored.
- Not done: restoring the base's pointer value at finish (it leaves the finished worktree pointing at a session in another worktree), and merge-step instructions only (no help when the PR is merged on GitHub).
- A detached HEAD or a session still in the grill (no branch yet) gives no match, so no restore.

## Open Questions

N/A

## Notes

The user asked for the resolution to be as autonomous as possible. Reproduction scripts live in `.scratch/repro/` (not committed).
