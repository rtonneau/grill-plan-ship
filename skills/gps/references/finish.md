# /gps finish

**When:** All tickets complete (or, for a bounded session, once the resume is saved and the work is done).

**Run:** `node $CLAUDE_PLUGIN_ROOT/scripts/finish.js`

**What it does:**

1. Fails and changes nothing if the session is already finished, the grill or plan phase is not written yet, or any ticket is not Done (it lists which).
2. **GitHub sessions only** (`git` in `.session-config.json`, set by `/gps write` on the grill phase): fails and changes nothing unless the session branch is checked out — relay the hint (`git switch <branch>`). Uncommitted changes to tracked files print a `⚠️` but don't block. Then pushes the branch and opens a ready-for-review PR against the branch it started from (`gh pr create`); no extra confirmation — running `/gps finish` is the go-ahead. It never opens a second PR: a URL already saved in `git.pr_url` (from an interrupted earlier finish) or an open PR for the branch (`gh pr list --head`) is reused, and the push updates it. The output prints `🔀 Pull request: <url>`: relay it. If the push or `gh` fails, finish still succeeds, printing `⚠️` with the commands to run by hand: relay them, don't retry or run them yourself.
3. Generates `INDEX.md` (session summary with every ticket and links to its spec and log, plus a `## Branch & PR` section for GitHub sessions)
4. Records `finished_at` (and `git.pr_url`) in `.session-config.json`
5. Clears `.work/sessions/.current-session`
6. Prints an `UNFINISHED_SESSIONS [...]` line. If it lists any sessions, ask the user whether to switch to one of them. Only if they say yes, run `node $CLAUDE_PLUGIN_ROOT/scripts/set-current.js <session-id>`. Otherwise suggest `/gps start <feature-name>`.

**Output:** Summarized session (and its PR link, on GitHub projects), ready to start the next feature.
