# 0012: Session state files are synced

_Recorded 2026-10-28, after version 2.11.0._

## Context

Until now gps kept four per-machine files out of git: the current session pointer `.work/sessions/.current-session`, the seeds store `.work/sessions/.pending-seeds.json*` (with its corrupt backups), and the two payloads in progress, `.work/sessions/*/.write-payload.md` and `.work/sessions/*/.changelog-payload.md`. `/gps start` and `/gps init` added their lines to `.gitignore`. The pointer, the seeds and a write in flight therefore stayed on one machine, and a session resumed on another machine or branch found no pointer and no seeds.

## Decision

- `.work/` is committed whole. The four files are no longer git-ignored: `commitWorkDir` commits them with the rest of `GPS_WORK_PATHS` in `chore(gps)` commits.
- `LOCAL_ONLY` (`lib/setup.js`) holds only `.scratch/`, the per-machine test scratch directory. `.scratch/` stays git-ignored.
- `/gps start` adds only `.scratch/` to `.gitignore`, and leaves a `.gitignore` that already holds the four old lines alone.
- `/gps init` removes the four stale lines that older versions added (`STALE_IGNORES`), reports them and commits the change with the setup commit. Other `.gitignore` edits are left as they are. Only `/gps init` migrates an existing project.

## Alternatives rejected

- **Keep the files ignored and sync them another way** (a copy on a side branch, a separate store): more moving parts, and the files would still sit outside the record that `chore(gps)` commits already make.
- **A per-project setting for which files sync:** one more setting to explain, for a choice that should match wherever a session can be resumed.
- **Let `/gps start` remove the stale lines:** it would change `.gitignore` in the middle of starting a session. `/gps init` is the step the user runs on purpose.
- **Clean the stale lines in `/gps clean`:** `clean.js` manages sessions and seeds, not the project's ignore file, so it is left unchanged.

## Consequences

Accepted costs:

- **Pointer churn:** `.current-session` changes whenever the current session changes. Machines and branches that use the project can make it conflict on merge, and the resolution is a choice of which session is current.
- **Payloads in history:** a payload in progress is committed if a `chore(gps)` commit happens between its prepare and its apply step. gps does not exclude it from that commit, so it stays in history.
- **One-time first commit:** the first `chore(gps)` commit after the upgrade adds the current pointer and the current seeds file once.
- **Old projects keep the stale lines** until `/gps init` runs in them.

`.scratch/` is the only path gps still git-ignores. This decision reverses the earlier choice that these four files are per-machine and ignored.
