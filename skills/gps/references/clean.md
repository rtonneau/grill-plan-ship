# /gps clean

**When:** Removing old or abandoned sessions, typically after `/gps status` flags some as `stale` or `very-stale`, or dropping scouted ideas (from `/gps scout`) you won't start. Takes optional session ids or idea slugs.

**What it does:**

1. **List** — run `node $CLAUDE_PLUGIN_ROOT/scripts/clean.js` (read-only). It prints JSON with two lists:
   - `sessions`, most idle first: `sessionId`, `featureName`, `finished`, `current`, `deletable`, `ticketsStarted`, `branch`, `prUrl`, `issueUrl`, `lastActivityAt`, `idleDays` and `staleness` (`null`, `stale` at 14+ idle days, `very-stale` at 28+). The current session has `deletable: false`.
   - `ideas`, scouted ideas not started yet, oldest first: `slug`, `problem`, `strength`, `sourceReport`, `createdAt`, `idleDays`. If `ideasProblem` is set, the ideas file is unreadable: say so; ideas can't be dropped until `/gps scout` moves it aside.

   Render each non-empty list as a table and mark `very-stale` sessions first. Suggest candidates, but never choose for the user.
2. **Confirm** — with ids from the user (or from `/gps clean <id>...`, where each id is a session id or an idea slug), tell them exactly what will be removed: each session's name, phase state (`finished` or not) and idle days, and each idea's slug and problem. Add a warning for every unfinished session, every session with `ticketsStarted` above 0, and every session with a `branch`, `prUrl` or `issueUrl` (those are **not** deleted; only the local session folder is). Wait for an explicit yes.
3. **Delete** — after the yes, run `node $CLAUDE_PLUGIN_ROOT/scripts/clean.js --delete <id>...` with the session ids and idea slugs together. The handler validates every id first and changes nothing if any is invalid, unknown or the current session (to clean the current one, ask the user, then switch first with `node $CLAUDE_PLUGIN_ROOT/scripts/set-current.js <session-id>`).

It never touches `.current-session`, scout reports, git branches, pull requests or issues. Deletion cannot be undone.

**Output:** `✅ Deleted session <id>.` per session and `✅ Dropped scouted idea <slug>.` per idea; nothing is created.

**Example:**

```
/gps clean
/gps clean 2026-08-01__old-idea 2026-08-14__abandoned-spike
/gps clean runconfig-resolver
```
