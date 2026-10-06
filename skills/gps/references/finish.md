# /gps finish

**When:** every ticket is Done (bounded session: the resume is saved and the work is done).

1. `changelog-prepare.js`. If enabled: draft user-facing bullets (what a user notices; not refactors or gps bookkeeping) in the file's format and pick the bump (≥ its floor; `--reason` when higher), write them to its `payloadPath`, then `changelog-apply.js --bump <level> [--reason "…"]`. Ask nothing. A `❌` stops the finish.
2. `finish.js`. If it stops on an issue question, ask the user "Close issue #N as well?" with `AskUserQuestion` and run it again with `--close-issue` (yes) or `--keep-issue` (no).
3. Relay its output, `⚠️` lines included. When it lists commands to run by hand, relay them; don't run or retry them yourself.
4. If it lists unfinished sessions, ask whether to switch to one; only on yes, `set-current.js <session-id>`.

It commits leftover changes to tracked files, pushes the branch and opens (or reuses) the pull request for a GitHub session, writes INDEX.md, commits `.work/` (the session record and its changelog fragment; CHANGELOG.md is left for `/gps release`) and pushes it, then switches back to the base branch. Running `/gps finish` is the go-ahead: ask nothing else, except the issue question of step 2 and the switch of step 4.

**Example:** `/gps finish`
