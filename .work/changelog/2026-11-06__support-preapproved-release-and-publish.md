---
bump: minor
floor: minor
---
- `/gps release --publish [--version X.Y.Z]` preapproves a release: it cuts the suggested (or given) version, pushes the commit and tag and creates the GitHub Release in one call, asking nothing. After a failed push, running it again resumes at the push. `/gps auto` still never releases.
