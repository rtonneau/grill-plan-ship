---
bump: minor
floor: minor
---
- `/gps release` bumps a Cargo workspace: the `[workspace.package]` version and the path dependencies pinned to the old version move together. Workspace members outside the project are warned about and left alone.
- A saved version list that came from detection is checked again on each release, so a version file added later is picked up; saved entries stay.
- `release.postBump` runs shell commands (such as a lockfile refresh) after the version files are written. Changed tracked files join the release commit, and a failing command puts everything back. The commands run only once you approve the exact list, with `--approve-post-bump`.
