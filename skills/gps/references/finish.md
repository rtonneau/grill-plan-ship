# /gps finish

**When:** every ticket is Done (bounded session: the resume is saved and the work is done).

1. `finish.js`. If it stops on an issue question, ask the user "Close issue #N as well?" with `AskUserQuestion` and run it again with `--close-issue` (yes) or `--keep-issue` (no).
2. Relay its output, `⚠️` lines included. When it lists commands to run by hand, relay them; don't run or retry them yourself.
3. If it lists unfinished sessions, ask whether to switch to one; only on yes, `set-current.js <session-id>`.

It commits leftover changes to tracked files, pushes the branch and opens (or reuses) the pull request for a GitHub session, writes INDEX.md, commits `.work/` (the session record) and pushes it, then switches back to the base branch. Running `/gps finish` is the go-ahead: ask nothing else.

**Example:** `/gps finish`
