# Session: scratch-cleanup

**Date:** 2026-10-23T16:09:47.722Z
**Status:** Grill phase complete

## Problem Statement

Session scratch dirs (`.scratch/tests/<session>/`) grow without limit. Heavy, regenerable build trees stay after `/gps finish`, and `/gps clean <session>` deletes the session folder but leaves its scratch dir behind. GPS should remove regenerable build output after a successful finish, keep lightweight evidence (logs, screenshots, XML dumps, verification summaries), and delete a session's scratch dir together with the session.

## Context & Constraints

- **Current behavior:** `lib/scratch-dir.js` creates `.scratch/tests/<session>/` at start and ticket-start, and the ticket brief (`dispatch-prompt.js`, `agents/gps-ticket-*.md`) sends build/run/test output there. Nothing ever deletes it. `clean.js` / `lib/clean.js` remove only `.work/sessions/<id>/` and seed entries. `gps-config.json` has no `scratch` key.
- **Pain point:** Build trees (CMake, node_modules, venvs…) pile up across sessions. Deleted sessions leave orphan scratch dirs.
- **Dependencies:** Script contract (`lib/cli.js`), `recordEvent` for state changes, `project-config.js` validation, and the rule that scripts never overwrite work. Commit logs may cite verification files under `.scratch`, so evidence must survive the default policy.
- **Tech stack:** Node.js built-ins only. Tests use `node --test` with throwaway dirs (`tests/helpers.js`).

## Success Metrics

- Without a `scratch` key, a successful `/gps finish` (planned or bounded session) removes every build tree under the session scratch dir, keeps every other file, and reports what it removed and how much space that freed.
- `scratch.cleanupOnFinish: "none"` leaves the scratch dir untouched; `"all"` removes the whole session scratch dir; an invalid value or an invalid `scratch.extraDirs` makes `project-config.js` throw the usual invalid-config error.
- A cleanup failure (e.g. a locked file) prints a `⚠️` line naming what is left, and finish still succeeds.
- `clean.js --delete <session>` also deletes `.scratch/tests/<session>`. `clean.js` lists orphan scratch dirs (no matching session) in their own table, and they can be named as ids. `--dry-run` shows each scratch dir's path and size.
- The ticket brief tells agents that build trees are deleted at finish and that cited logs go to `<scratch>/evidence/`.
- `npm test` passes, with new or extended tests for each touched script and lib.

## Architecture & Approach

- **Setting** in `.work/gps-config.json`: `scratch.cleanupOnFinish` is one of `none | build-artifacts | all` (default `build-artifacts` when unset). `scratch.extraDirs` is a list of extra directory names that adds to the built-in rule and never replaces it. `project-config.js` validates both and exposes `scratchSettings(projectRoot)` with the defaults applied. `/gps config` shows them read-only.
- **Build-tree rule** (shared lib, in or next to `lib/scratch-dir.js`): a directory at any depth under the session scratch dir is a build tree if its name is `build`, `build-*`, `build_*`, `node_modules`, `CMakeFiles`, `__pycache__`, `.venv`, `venv`, `target`, `dist`, `obj`, `.gradle` or `.cache`, if it contains `CMakeCache.txt`, or if its name is in `extraDirs`. A matched tree is removed whole, without descending into it. Everything else is evidence and is kept. A helper computes the recursive size of a directory.
- **Finish:** `finish.js` applies the policy as its last step, after the session is finished, and adds a line with what was removed and the space freed. The step is recorded with `recordEvent`. Failures go through `warn()` and do not change the exit code.
- **Clean:** `lib/clean.js` deletes the matching `.scratch/tests/<id>` with each session, lists orphan scratch dirs, and accepts them as ids (validated like the others before anything is removed). `renderPlan` shows each scratch path and size.
- **Brief:** one line in `dispatch-prompt.js` and the 4 `agents/gps-ticket-*.md` files (identical bodies, so all four change).
- **Docs:** `docs/decisions/0008-*.md` (default build-artifacts, a name rule rather than citation tracking, warn-don't-fail), README, `references/clean.md` and `references/finish.md`, and the CLAUDE.md decisions list.

## Assumptions & Trade-offs

- Commit-log citations are **not** tracked. A cited file inside a build tree (e.g. `build/Testing/Temporary/LastTest.log`) is deleted. The brief line asking agents to copy cited logs into `<scratch>/evidence/` is the mitigation.
- The default changes for existing projects (`build-artifacts`). This is acceptable because build trees can be regenerated, and finish reports what it removed.
- Out of scope: trimming already finished sessions without deleting them (no `clean --scratch` mode), size thresholds, and an extension-based evidence allowlist.
- `bin` and `out` are deliberately left out of the built-in names (too likely to hold evidence); projects can add them with `extraDirs`.

## Open Questions

None.

## Notes

Seeded by a user proposal (policies none / build-artifacts / all, with build-artifacts recommended because commit logs reference verification files under `.scratch`). Changelog: minor bump (new setting, changed default behavior at finish).
