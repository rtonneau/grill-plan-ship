# /gps resume

**When:** Picking a session back up after a break. Takes no arguments. Read-only — never writes or modifies any session file.

**What it does:**

1. Runs `node $CLAUDE_PLUGIN_ROOT/scripts/resume.js`, which resolves the current session, reads `HANDOFF.md` if one exists, and independently recomputes live state (ticket queue, git log, git status) the same way `/gps handoff` does — so it never trusts stale narrative for facts it can verify itself. If the handoff's recorded phase or active ticket disagrees with the freshly computed values, it's reported as `drift`.
2. If no `HANDOFF.md` exists, `live` is still fully populated and `handoff` is `null` — the command degrades gracefully rather than failing.
3. Claude Code renders the result as one combined briefing in chat: the handoff's narrative sections (if present), the live facts, any drift warning, and `live.suggestedNext` (the same next command `/gps status` gives).

**Output:** A catch-up briefing printed in chat. No files are created or changed.

**Example:**

```
/gps resume
```
