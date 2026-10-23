# /gps clean [id...]

**When:** removing old or abandoned sessions (often flagged `stale` by `/gps status`), scouted seeds you won't start, or orphan scratch dirs (`.scratch/tests/<id>` with no session dir). An id is a session id, a seed slug or an orphan scratch dir id.

1. Without ids: `clean.js`. Relay its tables, including the orphan scratch dirs with their sizes, and suggest candidates (`very-stale` first), but let the user choose.
2. `clean.js --dry-run <id>...`. Relay exactly what would go, each session's scratch dir and its size, every orphan dir and size, and every warning, then ask for an explicit yes using the router's host question rule.
3. On yes: `clean.js --delete <id>...`. Deletion cannot be undone, which is why only the user picks what goes.

**Examples:** `/gps clean` · `/gps clean 2026-08-01__old-idea runconfig-resolver`
