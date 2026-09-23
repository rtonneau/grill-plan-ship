# /gps handoff

**When:** Stopping work on the current session — end of day, context running low, switching to something else — and you want a future session (yours or a fresh AI's) to pick it back up with full context, not just "what phase is pending." Takes no arguments.

**What it does:**

1. Runs `node $CLAUDE_PLUGIN_ROOT/scripts/handoff.js`, which resolves the current session and auto-fills everything derivable from disk/git into `HANDOFF.md` at the session root: current phase, active ticket, ticket-queue state, project-wide commits since the session started, and uncommitted changes shown separately for the whole project and for the session directory. It prints this data as JSON.
2. Claude Code then fills in `HANDOFF.md`'s remaining narrative placeholders directly (Edit tool, not the script): where work stopped, the reasoning behind the current approach (including alternatives tried and rejected), the next concrete action to take, open questions only the user can resolve, decisions already settled (so a future session doesn't re-ask), and — only if either git status isn't "clean" — why the changes aren't committed yet.
3. `HANDOFF.md` is a single file: each run overwrites the previous one. There is no history log.

**Output:** `HANDOFF.md` written to the session root with full narrative context.

**Example:**

```
/gps handoff
```
