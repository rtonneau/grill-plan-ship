# 0008: Scratch cleanup at finish removes build trees by name

## Context

Each session keeps its build, run and test artifacts in `.scratch/tests/<session-id>/`. Build trees (CMake build directories, `node_modules`, caches) are large and regenerable, but the same directory also holds evidence a ticket cites, such as a test log or a run output. Finish needed a way to free the large part without losing the evidence, and `/gps clean` needed to remove scratch dirs of sessions that are already gone.

## Decision

- `scratch.cleanupOnFinish` defaults to `build-artifacts`. Finish removes every build tree in the session scratch dir whole and keeps every other file. `none` removes nothing; `all` removes the whole session scratch dir.
- A dir is a build tree by name: the built-in names in `BUILD_DIR_NAMES` (`build`, `build-*`, `build_*`, `node_modules`, `CMakeFiles`, `__pycache__`, `.venv`, `venv`, `target`, `dist`, `obj`, `.gradle`, `.cache`), any name listed in `scratch.extraDirs`, or any dir holding a `CMakeCache.txt`. GPS does not track which files a commit log cites.
- Finish warns and does not fail when a removal fails: each failure is printed with the path left behind, and the exit code and the rest of finish are unchanged.

## Alternatives rejected

- Track citations: parse each commit log for the files it cites and keep those. It is exact for paths written out in full, but it misses paths written in prose or abbreviated, and it couples finish to the wording of every commit log.
- Keep everything by default: the scratch dir grows with every session and nothing reclaims the space.
- Fail finish when a removal fails: a locked file would then block a session that is otherwise complete and committed.

## Consequences

A name rule can remove something a ticket cited. The known case is a CTest log, `Testing/Temporary/LastTest.log`, under a `build/` tree: the default policy deletes it at finish. The mitigation is in the ticket brief: the dispatched agent copies every log or output it cites into the scratch dir's `evidence/` subfolder, which is not a build tree and is kept. Users who cite a file from a build tree by hand must copy it the same way, or set `scratch.cleanupOnFinish` to `none`. `/gps clean` removes a session's scratch dir with the session, and lists and removes orphan scratch dirs (those with no session dir), always after showing their sizes.
