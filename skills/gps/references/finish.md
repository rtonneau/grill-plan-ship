# /gps finish

**When:** All tickets complete (or, for a bounded session, once the resume is saved and the work is done).

**Run:** `node $CLAUDE_PLUGIN_ROOT/skills/gps/scripts/finish.js` (add `--close-issue` only as described in step 5)

**What it does:**

1. Fails and changes nothing if the session is already finished, the grill or plan phase is not written yet, or any ticket is not Done (it lists which).
2. **GitHub sessions only** (`git` in `.session-config.json`, set by `/gps write` on the plan phase; bounded sessions have none and open no PR): fails and changes nothing unless the session branch is checked out — relay the hint (`git switch <branch>`).
3. **Every session:** commits whatever is left in tracked files (`git add -u`, e.g. a log a project hook appends to) as `chore: commit remaining changes (gps finish <session-id>)`, on the checked-out branch, so on GitHub sessions it lands in the PR. It prints `📦 Committed N remaining file(s)`. Untracked files are never committed: they are listed in a `⚠️` (relay it; don't commit them yourself unless the user asks). If the commit fails (e.g. a pre-commit hook), finish still succeeds and prints `⚠️` with the commands: relay them, don't retry.
4. **GitHub sessions only:** pushes the branch and opens a ready-for-review PR against the branch it started from (`gh pr create`); no extra confirmation — running `/gps finish` is the go-ahead. It never opens a second PR: a URL already saved in `git.pr_url` (from an interrupted earlier finish) or an open PR for the branch (`gh pr list --head`) is reused, and the push updates it. The output prints `🔀 Pull request: <url>`: relay it. If the push or `gh` fails, finish still succeeds, printing `⚠️` with the commands to run by hand: relay them, don't retry or run them yourself. For an issue session the PR body says `Closes #N`.
5. **Issue sessions without a branch** (`issue` in `.session-config.json`, bounded work): **before running finish**, ask the user "Close issue #N as well?". Run `finish.js --close-issue` only on yes. Finish posts a summary comment on the issue (`💬`) and, with the flag, closes it (`✅`). If gh fails it still succeeds and prints `⚠️` with the commands to run by hand: relay them, don't retry. Never pass the flag for a session with a branch: its PR closes the issue when merged.
6. Generates `INDEX.md` (session summary with every ticket and links to its spec and log, a `## Remaining changes` section when step 3 committed or failed, a `## Branch & PR` section for GitHub sessions, an `## Issue` section for issue sessions and a `## Timeline`)
7. Records `finished_at` (and `git.pr_url`, `issue.commented` / `issue.closed`) in `.session-config.json`
8. Clears `.work/sessions/.current-session`
9. **GitHub sessions only:** switches back to the base branch (`git.base_branch`: the branch checked out when the plan write created the session branch, e.g. `main` or `O2_Included`) and prints `↩️ Back on <base>: merge the pull request, then git pull`. Relay it. Skipped after a failed step-3 commit (`⚠️ Still on <branch>`), so leftover changes stay on the session branch. If the switch fails, finish still succeeds and prints `⚠️` with the command: relay it, don't retry.
10. Prints an `UNFINISHED_SESSIONS [...]` line. If it lists any sessions, ask the user whether to switch to one of them. Only if they say yes, run `node $CLAUDE_PLUGIN_ROOT/skills/gps/scripts/set-current.js <session-id>`. Otherwise suggest `/gps start <feature-name>`.

**Output:** Summarized session with nothing left uncommitted in tracked files (and, on GitHub projects, its PR link, back on the base branch), ready to start the next feature.
