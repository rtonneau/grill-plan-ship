# /gps clean [id...]

**When:** removing old or abandoned sessions (often flagged `stale` by `/gps status`) or scouted ideas you won't start. An id is a session id or an idea slug.

1. Without ids: `clean.js`. Relay its tables and suggest candidates (`very-stale` first), but let the user choose.
2. `clean.js --dry-run <id>...`. Relay exactly what would go and every warning, then ask for an explicit yes with `AskUserQuestion`.
3. On yes: `clean.js --delete <id>...`. Deletion cannot be undone, which is why only the user picks what goes.

**Examples:** `/gps clean` · `/gps clean 2026-08-01__old-idea runconfig-resolver`
