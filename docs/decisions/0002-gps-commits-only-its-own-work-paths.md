# 0002: gps commits only its own .work/ paths

_Recorded 2026-10-05, version 2.5.0._

## Context

Other skills want to keep their files in a project's `.work/`, next to gps's sessions. Until 2.4.0, `commitWorkDir` (`skills/gps/scripts/lib/git.js`) ran `git add -A -- .work`. That put every file under `.work/` into gps's `chore(gps)` commits: at the plan write, after each ticket and at `/gps finish`. Another skill's half-written state ended up in gps's record, and the other skill couldn't decide when to commit it.

## Decision

gps owns four paths, listed in `GPS_WORK_PATHS`: `.work/gps-config.json`, `.work/GLOSSARY.md`, `.work/adr` and `.work/sessions`. `commitWorkDir` stages and commits only those paths. Other skills write in `.work/<skill-name>/` and commit their own files. [docs/WORK-DIR.md](../WORK-DIR.md) is the contract they follow, and `tests/skill.test.js` checks that it names every entry of `GPS_WORK_PATHS`.

Git refuses `add` on a path that is neither on disk nor tracked, and `commit` on a directory that holds no tracked file. So `commitWorkDir` stages only the owned paths that exist (or are tracked deletions) and aren't ignored. It then commits only the paths that hold a staged file.

## Why

- **Writing the old behaviour down instead** would have been the smallest change. But other skills would have had their files committed under gps's name, whenever gps chose.
- **Leaving out unknown folders instead of listing the owned ones** would have needed the same code, plus a guess about what counts as "unknown".

Listing the owned paths is the explicit option. The same list also documents them for other skills.

## Consequences

- A new gps path under `.work/` must be added to `GPS_WORK_PATHS` and to `docs/WORK-DIR.md`. The test enforces the doc half.
- `/gps finish` and gps's git checks already left out all of `.work/`, so other skills' uncommitted files never block gps.
