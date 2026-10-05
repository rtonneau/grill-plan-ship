# Sharing .work/ with gps

gps keeps its sessions and settings in a project's `.work/` folder. Other skills can store their files there too, if they follow the rules below. gps stays the main manager of `.work/`. The list of paths it owns lives in code, as `GPS_WORK_PATHS` in `skills/gps/scripts/lib/git.js`, and a test checks that this page names every one of them.

## Paths gps owns

Your skill may read these, but never write, move or delete them.

| Path | What it is |
|---|---|
| `.work/gps-config.json` | project-wide gps settings |
| `.work/GLOSSARY.md`, `.work/adr/` | gps's fallback glossary and ADRs, used only when the project has none of its own (a root `GLOSSARY.md`, `docs/adr/`) |
| `.work/sessions/` | the whole tree: session directories, `.current-session`, `.pending-seeds.json*`, `scout-reports/` and every file inside a session |

## Your skill's space

Write only inside `.work/<skill-name>/`, using a name that is not one of the paths above. Put nothing else at the top level of `.work/`, and nothing inside `.work/sessions/`.

## What gps promises

- gps never commits, edits or deletes anything outside the paths it owns. Its `chore(gps)` commits contain only those paths, even when your files are staged.
- `/gps clean` deletes only session directories (folders under `.work/sessions/` that hold a `.session-config.json`) and entries of `.pending-seeds.json`.
- gps's git checks leave out all of `.work/`. Your uncommitted files there never make a ticket or `/gps finish` fail. One exception: if a tracked file of yours is modified, and differs on the base branch, `/gps finish` can't switch back to that branch. It then stays on the session branch and says so.

## What your skill must do

- **Commit your own files.** gps doesn't commit them.
- **Keep per-machine files out of git.** Add them to `.gitignore` yourself.
- **Read session state from the files before acting on a session.** Don't infer it from folder names. The files to read:
  - `.work/sessions/.current-session`: the current session's id. It is absent when there is none.
  - `.work/sessions/<id>/.session-config.json`
  - `02-plan/plan.md` and `02-plan/tickets/` in that session.
- **Rely only on the stable `.session-config.json` fields**, and know when each one can be missing:
  - `feature_name`: always set.
  - `kind`: `"issue"` for a `/gps start --issue` session; absent for a feature session.
  - `git.branch`: the session branch. `git` is absent until `/gps write` creates the branch, and for a session without one.
  - `current_phase`: the last phase gps recorded. The files are the truth: the phase is derived from them, and `/gps status` reports when the two disagree.

  Any other field may change between gps versions.
- **Expect sessions on other branches.** `.work/` is committed with the code, so a session's files live on its branch. Sessions on a branch that isn't checked out are not on disk.

If `.work/` is git-ignored (older gps versions added that line), gps commits none of its own files. `/gps init` offers to remove the line.

## Outside .work/

gps also uses `.scratch/`, which is git-ignored and holds per-machine test scratch folders. Leave it alone.
