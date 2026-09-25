# /gps finish

**When:** All tickets complete (or, for a bounded session, once the resume is saved and the work is done).

**Run:** `node $CLAUDE_PLUGIN_ROOT/scripts/finish.js` (add `--close-issue` only as described in step 3)

**What it does:**

1. Fails and changes nothing if the session is already finished, the grill or plan phase is not written yet, or any ticket is not Done (it lists which).
2. **GitHub sessions only** (`git` in `.session-config.json`, set by `/gps write` on the plan phase; bounded sessions have none and open no PR): fails and changes nothing unless the session branch is checked out — relay the hint (`git switch <branch>`). Uncommitted changes to tracked files print a `⚠️` but don't block. Then pushes the branch and opens a ready-for-review PR against the branch it started from (`gh pr create`); no extra confirmation — running `/gps finish` is the go-ahead. It never opens a second PR: a URL already saved in `git.pr_url` (from an interrupted earlier finish) or an open PR for the branch (`gh pr list --head`) is reused, and the push updates it. The output prints `🔀 Pull request: <url>`: relay it. If the push or `gh` fails, finish still succeeds, printing `⚠️` with the commands to run by hand: relay them, don't retry or run them yourself. For an issue session the PR body says `Closes #N`.
3. **Issue sessions without a branch** (`issue` in `.session-config.json`, bounded work): **before running finish**, ask the user "Close issue #N as well?". Run `finish.js --close-issue` only on yes. Finish posts a summary comment on the issue (`💬`) and, with the flag, closes it (`✅`). If gh fails it still succeeds and prints `⚠️` with the commands to run by hand: relay them, don't retry. Never pass the flag for a session with a branch: its PR closes the issue when merged.
4. Generates `INDEX.md` (session summary with every ticket and links to its spec and log, with a `## Branch & PR` section for GitHub sessions, an `## Issue` section for issue sessions and a `## Timeline`)
5. Records `finished_at` (and `git.pr_url`, `issue.commented` / `issue.closed`) in `.session-config.json`
6. Clears `.work/sessions/.current-session`
7. Prints an `UNFINISHED_SESSIONS [...]` line. If it lists any sessions, ask the user whether to switch to one of them. Only if they say yes, run `node $CLAUDE_PLUGIN_ROOT/scripts/set-current.js <session-id>`. Otherwise suggest `/gps start <feature-name>`.

**Output:** Summarized session (and its PR link, on GitHub projects), ready to start the next feature.
