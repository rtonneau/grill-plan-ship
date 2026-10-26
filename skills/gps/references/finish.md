# /gps finish

**When:** every ticket is Done (bounded session: the resume is saved and the work is done).

1. `changelog-prepare.js`. If enabled: draft user-facing bullets (what a user notices; not refactors or gps bookkeeping) in the file's format and pick the bump (≥ its floor; `--reason` when higher), write them to its `payloadPath`, then `changelog-apply.js --bump <level> [--reason "…"]`. Ask nothing. A `❌` stops the finish.
2. Write the PR title's descriptive part: a short, clean one-line summary of what the session ended up doing (its resume's Problem Statement and finished tickets, not the raw text typed into `/gps start`, which may have drifted). Ask nothing.
3. `finish.js --title "<title>"`. If it stops on an issue question, ask the user "Close issue #N as well?" using the router's host question rule and run it again with `--close-issue` (yes) or `--keep-issue` (no), keeping `--title`.
4. Relay its output, `🧹` and `⚠️` lines included. The `🧹 Scratch:` line reports what `scratch.cleanupOnFinish` removed; each `⚠️` names a path left behind. When it lists commands to run by hand, relay them; don't run or retry them yourself.
5. If it lists unfinished sessions, ask using the router's host question rule whether to switch to one; only on yes, `set-current.js <session-id> --confirmed`.

**Chained finish** (run by a full `/gps ship` or by `/gps auto`, not typed): ask nothing. If step 3 stops on the issue question, run it again with `--keep-issue` without asking; step 5 is skipped. A typed `/gps finish` asks both.

It commits leftover changes to tracked files, pushes the branch and opens (or reuses) the pull request for a GitHub session, writes INDEX.md, commits `.work/` (the session record and its changelog fragment; CHANGELOG.md is left for `/gps release`) and pushes it, then switches back to the base branch. Running `/gps finish` is the go-ahead: ask nothing else, except the issue question of step 3 and the switch of step 5.

**Example:** `/gps finish`
