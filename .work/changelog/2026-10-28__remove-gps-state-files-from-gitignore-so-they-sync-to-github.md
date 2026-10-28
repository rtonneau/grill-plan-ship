---
bump: minor
floor: minor
reason: Changes which files gps ignores in every project; /gps init migrates old projects
---
- The session pointer, scouted seeds and in-flight write and changelog payloads are no longer git-ignored. They are committed in the `chore(gps)` commits with the rest of `.work/`, so a session can be resumed from another machine. Only `.scratch/` stays ignored.
- `/gps init` removes the four `.gitignore` lines older versions added for those files and reports it; `/gps start` leaves an existing `.gitignore` alone.
