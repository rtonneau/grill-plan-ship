# Session: Remove gps state files from .gitignore so they sync to GitHub

**Date:** 2026-10-28T08:21:25.161Z
**Status:** Grill phase complete

## Problem Statement

gps ignores four per-machine files in git: `.work/sessions/.current-session`, `.work/sessions/.pending-seeds.json*`, `.work/sessions/*/.write-payload.md` and `.work/sessions/*/.changelog-payload.md`. The user wants them synced to GitHub like the rest of `.work/`. This is a change to the plugin, not only to this repo's `.gitignore`, because `LOCAL_ONLY` writes these lines into every project.

## Context & Constraints

- **Current behavior:** `LOCAL_ONLY` in `skills/gps/scripts/lib/setup.js` lists `.scratch/` and the four entries. `/gps start` and `/gps init` add the missing ones to `.gitignore`. `inspectSetup` counts a missing one as not ready. `commitWorkDir` (`lib/git.js`) skips files git ignores.
- **Pain point:** the pointer, seeds and in-flight state do not follow the user from one machine to another.
- **Dependencies:** `docs/WORK-DIR.md`, `.claude/CLAUDE.md` (session files paragraph), comments in `git.js`, `start.js` and `session-init.js`, and the setup, init and start tests. `clean.js` is unchanged.
- **Tech stack:** Node.js built-ins only; scripts follow `lib/cli.js`; tests run real scripts in throwaway directories.

## Success Metrics

- `LOCAL_ONLY` holds only `.scratch/`; this repo's `.gitignore` no longer lists the four entries.
- `/gps start` on a fresh project writes none of the four lines and leaves an existing `.gitignore` alone.
- `/gps init` on a project with the four stale lines removes exactly those lines (other `.gitignore` edits untouched), reports it, and commits the change with the setup commit. Afterwards it reports the project as ready.
- `commitWorkDir` commits `.current-session`, the seeds file and both payloads in `chore(gps)` commits once they are not ignored.
- `npm test` and the size check pass; docs and comments no longer say these files are git-ignored.

## Architecture & Approach

- Reduce `LOCAL_ONLY` to `.scratch/`. Add a `STALE_IGNORES` list of the four removed entries in `lib/setup.js`.
- `inspectSetup` reports stale entries present in `.gitignore` as not ready. `applySetup` strips them with `removeGitignoreEntry`, as it already does for `.work/`, and returns them in its result. `/gps init` reports them.
- `/gps start` keeps calling the ensure step, which now only handles `.scratch/`; it never removes stale lines.
- `commitWorkDir` needs no code change. Update its comment and the docs.
- Add a numbered decision record in `docs/decisions/` that reverses the per-machine choice and lists the accepted costs.
- Remove the four lines from this repo's `.gitignore`.
- The changelog fragment declares a minor bump with a reason about the behavior change.

## Assumptions & Trade-offs

- Accepted: `.current-session` churns across machines and branches and can conflict.
- Accepted: payloads can land in history if a `chore(gps)` commit happens between prepare and apply. No pathspec exclude.
- Accepted: this session's current pointer and seeds go into the first commit (one-time).
- Not doing: a per-project setting; automatic cleanup of stale lines by `/gps start`; any change to `clean.js`.

## Open Questions

- None.

## Notes

The user chose the plugin-level scope, all four files, commit everything, and an init-time migration only (`/gps start` leaves old projects alone, a later `/gps init` fixes them). The decision record and a minor-bump flag are required.
