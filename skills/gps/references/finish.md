# /gps finish

**When:** All tickets complete (or, for a bounded session, once the resume is saved and the work is done).

**Run:** `node $CLAUDE_PLUGIN_ROOT/scripts/finish.js`

**What it does:**

1. Fails and changes nothing if the session is already finished, the grill or plan phase is not written yet, or any ticket is not Done (it lists which).
2. Generates `INDEX.md` (session summary with every ticket and links to its spec and log)
3. Records `finished_at` in `.session-config.json`
4. Clears `.work/sessions/.current-session`
5. Prints an `UNFINISHED_SESSIONS [...]` line. If it lists any sessions, ask the user whether to switch to one of them. Only if they say yes, run `node $CLAUDE_PLUGIN_ROOT/scripts/set-current.js <session-id>`. Otherwise suggest `/gps start <feature-name>`.

**Output:** Summarized session, ready to start the next feature.
