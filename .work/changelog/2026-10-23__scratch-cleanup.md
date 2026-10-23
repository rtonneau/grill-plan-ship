---
bump: minor
floor: minor
---
- `/gps finish` now removes regenerable build trees (`build/`, `node_modules/`, CMake build dirs, caches…) from the session's `.scratch/tests/<session>/` dir and keeps logs and other evidence; set `scratch.cleanupOnFinish` to `none`, `build-artifacts` (default) or `all`, and add names with `scratch.extraDirs`.
- `/gps clean` deletes a session's scratch dir along with the session, lists orphan scratch dirs (no matching session) so they can be deleted too, and shows each scratch dir's size in the dry run.
- Ticket subagents are told to copy any log they cite into the scratch dir's `evidence/` folder, so it survives the cleanup at finish.
