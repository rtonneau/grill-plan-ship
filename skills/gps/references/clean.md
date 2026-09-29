# /gps clean

**When:** Removing old or abandoned sessions, typically after `/gps status` flags some as `stale` or `very-stale`. Takes optional session ids.

**What it does:**

1. **List** — run `node $CLAUDE_PLUGIN_ROOT/scripts/clean.js` (read-only). It prints every session, most idle first: `sessionId`, `featureName`, `finished`, `current`, `deletable`, `ticketsStarted`, `branch`, `prUrl`, `issueUrl`, `lastActivityAt`, `idleDays` and `staleness` (`null`, `stale` at 14+ idle days, `very-stale` at 28+). Render it as a table and mark `very-stale` sessions first. Suggest candidates, but never choose for the user. The current session has `deletable: false`.
2. **Confirm** — with ids from the user (or from `/gps clean <session-id>...`), tell them exactly what will be removed: each session's name, phase state (`finished` or not) and idle days. Add a warning for every unfinished session, every session with `ticketsStarted` above 0, and every session with a `branch`, `prUrl` or `issueUrl` (those are **not** deleted; only the local session folder is). Wait for an explicit yes.
3. **Delete** — after the yes, run `node $CLAUDE_PLUGIN_ROOT/scripts/clean.js --delete <session-id>...`. The handler validates every id first and deletes nothing if any is invalid, missing or the current session (to clean the current one, ask the user, then switch first with `node $CLAUDE_PLUGIN_ROOT/scripts/set-current.js <session-id>`).

It never touches `.current-session`, `.pending-seeds.json`, git branches, pull requests or issues. Deletion cannot be undone.

**Output:** `✅ Deleted session <id>.` per session; nothing is created.

**Example:**

```
/gps clean
/gps clean 2026-08-01__old-idea 2026-08-14__abandoned-spike
```
