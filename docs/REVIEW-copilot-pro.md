# Review of grill-plan-ship (gps) for use with GitHub Copilot Pro

_Reviewed 2026-10-07 against version 2.6.1, by reading the README, PRIVACY.md, `SKILL.md`, all `references/*.md`, the agents, CI, the decision records and the main scripts (`lib/git.js`, `lib/github.js`, `lib/setup.js`, `lib/guard.js`, `finish.js`, `release.js`, `ticket-complete.js`, `ticket-check.js`, `dispatch-prompt.js`; spot checks of `auto-route`, `scout-ingest`, `write-apply`, `ticket-start`). The test suite was not run and the plugin was not run against a live repository: every finding comes from reading code and docs._

## Pass 1: Understand and map

**How gps works**

- **Division of labour:** Claude does the judgment steps (grill, plan, review, summarize). Node scripts do everything deterministic. The scripts are pre-approved one by one in `allowed-tools`.
- **Phases:**
  - `/gps start` creates a session in `.work/sessions/<date>__<slug>/`, then a grill runs through `AskUserQuestion`.
  - `write-apply` saves the design. On GitHub projects the plan write also creates the branch `feat/…` from whatever is checked out.
  - `/gps ship` has three modes: inline, subagent, or subagent plus inline follow-up. It runs one ticket at a time, one commit per ticket. `ticket-complete.js` commits only the files named with `--file`, then makes a separate `chore(gps)` commit for `.work/`.
  - `/gps finish` runs `git add -u` on leftover tracked changes and commits them. It then pushes the branch, runs `gh pr create`, writes INDEX.md, pushes again and switches back to the base branch.
  - `/gps release` merges the changelog fragments into a version, commits, tags, and pushes after a yes. `/gps auto` stops at `finish` and never reaches release.
- **GitHub surface:** `gh auth status`, `gh pr list/create`, `gh issue create/comment/close`, `gh release view/create`, and `git push` of the session branch and of the release commit and tag. All run with the user's own credentials.
- **Existing safeguards:**
  - Commands use argument arrays, never a shell string.
  - `.work/` commits are limited to an allowlist of paths (`GPS_WORK_PATHS`).
  - Scripts refuse to overwrite existing work.
  - A subagent's DONE report is checked by `ticket-check.js`.
  - A failed ticket stops the run.
  - Release needs a clean tree, the base branch, and being up to date with origin.
- **Copilot:** the string "copilot" appears nowhere in the repo. gps is Claude-only; any Copilot Pro use is something added around it.

**Uncertain after Pass 1:** whether `AskUserQuestion` approvals are enforced or only instructed; whether the PR body carries traceability; what Copilot Pro includes today.

## Pass 2: Candidate findings

| # | Severity | Finding |
|---|---|---|
| 1 | High | `/gps finish` pushes and opens the PR with no confirmation. The reference says "Running `/gps finish` is the go-ahead". `finish.js` is pre-approved in `allowed-tools`, so Claude Code won't prompt either. |
| 2 | High | `commitRemainingChanges` runs `git add -u` over all tracked files outside `.work/` and commits them, then pushes. Edits never reviewed (a modified tracked config, say) reach the PR. |
| 3 | High | No secret scan. Nothing checks staged diffs, `.work/` content or PR bodies for credentials before commit or push. Grill resumes, plans, scout reports and the INDEX timeline are committed and pushed. |
| 4 | Medium | The PR is opened non-draft, with no reviewers, labels, project link or milestone. |
| 5 | Medium | Traceability is thin. Branch names carry no issue number, and ticket commits carry no `#N` on planned sessions. Only issue sessions get `Closes #N`, and only in the PR body. No project-board updates exist. |
| 6 | Medium | The plan write branches from whatever is checked out, and `base_branch` is recorded from it. On a stale or unrelated branch the PR targets the wrong base. |
| 7 | Medium | Quality gates are only the ticket's "Verification Step". `ticket-check.js` verifies the recorded commit exists, not that tests pass. No CI-status check before finish or release. |
| 8 | Medium | `/gps release --push` pushes straight to the base branch (commit and tag, atomic), bypassing review on repos without enforced branch protection. It is gated only by an `AskUserQuestion` yes. |
| 9 | Medium | The `AskUserQuestion` approval points (ticket approval, ship mode, release) are instructions to Claude, not script-enforced. |
| 10 | Low | `scout --from <file>` accepts an absolute path and archives the file into `.work/sessions/scout-reports/`, which is committed. |
| 11 | Low | No rollback guidance. Failed pushes print by-hand commands, but reverting a bad ticket or session is not documented. |
| 12 | Low | Subagents get "All tools", and a ticket's Verification Step runs arbitrary commands from the ticket text. |
| 13 | Info | A single Windows CI runner and fragment-based changelogs scale well. |
| 14 | Info | There is no Copilot integration. |

## Pass 3: Verification and final list

**Dropped or downgraded after checking against the code and docs**

- **#12 dropped.** This is how Claude Code subagents work. The Verification Step is user-approved ticket content, and the dispatch prompt forbids nested subagents.
- **#9 downgraded to Low.** The README is explicit that these are instruction-level, and `auto-route` structurally excludes release. It is a documented design choice.
- **#8 stays, at Medium.** `release.js --push` refuses off the base branch and unless HEAD is a tagged release commit, but there is no check for branch protection or CI.
- **#10 stays at Low.** `scout-ingest.js` resolves absolute paths.
- **#13 and #14** are informational.

**Verified findings, in priority order**

1. **High, #3:** no secret or sensitive-content gate before any commit or push, including `.work/` narrative files that Claude writes.
2. **High, #2:** `git add -u` sweeps unreviewed tracked edits into the PR.
3. **High, #1:** finish pushes and opens the PR with no confirmation under `allowed-tools`. Intentional ("go-ahead"), but high risk on a shared repo.
4. **Medium:** #4 (non-draft PR), #5 (traceability), #6 (base branch), #7 (no CI gate), #8 (release push to base).
5. **Low:** #9, #10, #11.

**Not verified:** which Copilot Pro features exist and their quota. Confirm against GitHub's current docs before relying on the plan below.

## Implementation plan: gps with Copilot Pro, safely

**Ground rules (no code change, do first)**

1. Turn on branch protection for `main` on every repo. Require a PR, require the CI check, block force-push and, if possible, direct pushes. That makes #8 harmless and covers #1.
2. Keep `.env` and similar files git-ignored. Run a secret scanner (GitHub secret scanning push protection, or `gitleaks` as a pre-commit hook). A pre-commit hook also covers #3, because gps commits go through normal `git commit`.
3. Run `/gps finish` only from a clean `git status`, so #2 has nothing to sweep. For a hard guarantee, remove `finish.js` from `allowed-tools` in a local copy so Claude Code prompts.

**Workflow**

1. Create the GitHub issue first (`/gps start --issue` for bugs; by hand for features). Put the issue number in the branch name and in every ticket commit message by convention, since gps doesn't.
2. Run `/gps start` → grill → `/gps plan`. Review the tickets before approving.
3. Run `/gps ship` in **subagent + inline follow-up** mode, so each diff is seen before it commits.
4. Run `/gps finish` and treat the PR as a draft in practice: don't request review until CI is green.
5. Add Copilot as a second reviewer on the PR from the GitHub UI or `gh`. Read its comments critically and resolve them yourself. It does not replace your own review.
6. Merge through the PR only. Run `/gps release` from an up-to-date `main`, and answer **no** to "Push and publish?" if protection blocks the direct push; push the release commit through a PR instead.
7. For small, well-specified issues, Copilot's coding agent can be assigned on GitHub directly, not through gps. Its PRs land outside gps's session records.

**Worth contributing to gps itself (ordered by value)**

1. Add a `--draft` option or config key for `gh pr create`.
2. Make `commitRemainingChanges` list the files and require an explicit flag to commit them.
3. Add an optional pre-push secret-scan hook.
4. Include the issue number in the branch name and in planned-session commit messages.
5. Document rollback (revert the ticket commit, `/gps clean`) in the README.
