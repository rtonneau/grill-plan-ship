# /gps finish

**When:** every ticket is Done (small work: the resume is saved and the change committed).

1. `changelog-prepare.js`. If enabled: draft user-facing bullets (what a user notices; not refactors or gps bookkeeping) in the file's format and pick the bump (≥ its floor; `--reason` when higher), write them to its `payloadPath`, then `changelog-apply.js --bump <level> [--reason "…"]`. Ask nothing. A `❌` stops the finish.
2. Write the PR title's descriptive part: a short, clean one-line summary of what the session ended up doing (its resume's Problem Statement and finished tickets, not the raw text typed into `/gps start`, which may have drifted). Ask nothing.
3. `finish.js --title "<title>"`. If it stops on an issue question, ask the user "Close issue #N as well?" using the host question rule and run it again with `--close-issue` (yes) or `--keep-issue` (no), keeping `--title`.
4. Relay its output, `🧹` and `⚠️` lines included. The `🧹 Scratch:` line reports what `scratch.cleanupOnFinish` removed; each `⚠️` names a path left behind. When it lists commands to run by hand, relay them; don't run or retry them yourself.
5. If it lists unfinished sessions, ask using the host question rule whether to switch to one; only on yes, `set-current.js <session-id> --confirmed`.

**Chained finish** (run by a full `/gps ship` or by `/gps auto`, not typed): ask nothing. If step 3 stops on the issue question, run it again with `--keep-issue` without asking; step 5 is skipped. A typed `/gps finish` asks both.

It refuses tracked leftovers without staging them: review their ownership and commit only the session's intended files. It then pushes the branch and opens (or reuses) the pull request for a GitHub session, writes INDEX.md, commits and pushes `.work/`, then switches back to the base branch. Running `/gps finish` is the go-ahead for delivery; retain any narrower user restriction on publication.

Failed delivery retains a local finish journal; fix the cause and rerun `finish.js` even if the session pointer was already cleared. Follow a reported `--commit` recovery after interrupted ticket completion. An unexpected hook commit blocks GPS pushes until the user reviews it and explicitly removes the named publication marker. Preserve user edits and native permission boundaries.

**Example:** `/gps finish`
