# Design: a shared `.work/` contract

_2026-10-05, targets version 2.5.0._

## Goal

Other skills may store their files in a project's `.work/` next to gps without breaking it. gps stays the main manager of `.work/`. A contract document in this repo says which paths gps owns, what other skills may do, and what gps promises in return. Skill authors read it and follow it; gps enforces nothing at runtime beyond keeping to its own paths.

## Decisions taken

- The contract lives **only in this repo**, as `docs/WORK-DIR.md`. It is not copied into projects.
- gps **commits only the paths it owns**. Today `commitWorkDir` stages all of `.work/`, which would sweep other skills' files into `chore(gps)` commits.
- gps owns **all of `.work/sessions/`**. Other skills get no space inside a session.

## Section 1: `docs/WORK-DIR.md`

### Paths gps owns

Other skills may read these, but never write, move or delete them.

| Path | What it is |
|---|---|
| `.work/gps-config.json` | project-wide gps settings |
| `.work/GLOSSARY.md`, `.work/adr/` | gps's fallback glossary and ADRs, used only when the project has none of its own |
| `.work/sessions/` | the whole tree: session directories, `.current-session`, `.pending-seeds.json*`, `scout-reports/`, per-ticket files |

### Space for other skills

Each skill writes only inside `.work/<skill-name>/`. The name must not collide with a path gps owns. Nothing else goes at the top level of `.work/`.

### What gps promises

- It never commits, edits or deletes anything outside the paths it owns.
- `/gps clean` deletes only session directories (directories under `sessions/` holding a `.session-config.json`) and entries of `.pending-seeds.json`.
- Its git checks (`readGitStatus`'s project view, `commitRemainingChanges`) leave out all of `.work/`, so another skill's uncommitted files never block a ticket or `/gps finish`.

### What other skills must do

- Commit their own files. gps does not commit them.
- Add their per-machine files to `.gitignore` themselves.
- Read session state from the files before acting on a session: `sessions/.current-session` (the current session's id; absent when none), `sessions/<id>/.session-config.json`, `02-plan/plan.md` and `02-plan/tickets/`. Do not infer state from directory names.
- In `.session-config.json`, rely only on these fields, which gps keeps stable: `current_phase`, `kind`, `feature_name`, `git.branch`. Everything else may change between gps versions.

### Outside `.work/`

gps also uses `.scratch/` (git-ignored, per-machine test scratch directories). Other skills leave it alone.

## Section 2: code, tests, docs

### Code (`skills/gps/scripts/lib/git.js`)

- New exported constant `GPS_WORK_PATHS = ['.work/gps-config.json', '.work/GLOSSARY.md', '.work/adr', '.work/sessions']`.
- `commitWorkDir` stages and commits only those paths. Because git fails on a pathspec that matches nothing, it first keeps the entries that exist on disk or are tracked (`isTracked`), so a deleted session directory is still committed as a deletion. When none remain, it returns "nothing to commit" as it does today when `.work/` is missing.
- The fallback `commands` it reports on failure list the same paths.
- No other change: `commitRemainingChanges` and the project view of `readGitStatus` already leave out all of `.work/`, which is correct under the contract.

### Drift guard

`tests/skill.test.js` fails when an entry of `GPS_WORK_PATHS` does not appear in `docs/WORK-DIR.md`.

### Tests (`tests/lib/git.test.js`, throwaway repos)

- A file under `.work/other-skill/` stays uncommitted after `commitWorkDir`; session files in the same call are committed.
- A deleted session directory is committed as a deletion.
- `commitWorkDir` works when `.work/GLOSSARY.md` and `.work/adr/` do not exist.

### Docs and release

- `docs/decisions/0002-gps-commits-only-its-own-work-paths.md`: why gps stopped committing all of `.work/`.
- `README.md` links `docs/WORK-DIR.md`; `.claude/CLAUDE.md` gets a Layout line for it, and its "Session files" paragraph says `commitWorkDir` commits `GPS_WORK_PATHS`.
- `CHANGELOG.md` entry; version 2.5.0 in `package.json`, `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`.

## Out of scope

- Copying the contract into projects (`.work/README.md`).
- Runtime enforcement (gps detecting or refusing foreign files).
- Space for other skills inside a session directory.
