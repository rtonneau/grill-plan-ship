# Session branch + PR design

**Date:** 2026-09-24
**Status:** Approved

## Goal

When a project is hosted on GitHub, each gps session does its work on its own
branch, and `/gps finish` opens a pull request for it. The branch name says what
the work is (`feat/dark-mode-toggle`), not just which session it came from.

## Decisions

| Question | Decision |
|---|---|
| When is the branch created? | When `/gps write` saves the grill resume (bounded sessions included). Sessions abandoned mid-brainstorm leave no branch. |
| Who names it? | Claude, as a `**Branch:**` field in the grill payload. No confirmation prompt. |
| Branch from where? | The current HEAD, whatever branch it is. That branch is recorded as `base_branch` and is the PR's base (stacked PR when not on the default branch). |
| How does finish open the PR? | Push + `gh pr create`, ready for review, no extra prompt. |
| Where does the PR show up? | INDEX.md (new "Branch & PR" section), `.session-config.json` (`git.pr_url`) and `/gps status`. |

## Detection

`scripts/lib/github.js` → `detectGithub(projectRoot)` is on when:

- `git rev-parse --is-inside-work-tree` is `true`, and
- `git remote get-url origin` points at `github.com` (`https://github.com/…`,
  `git@github.com:…`, `ssh://git@github.com/…`).

Otherwise the feature is off and every handler behaves as before. `gh` is only
needed at finish. Every git/gh call uses `execFileSync` with an argument array.

## Branch creation (`/gps write`, grill phase)

- `write-target.js`: when GitHub is on, `fields` gains `Branch`, and the JSON
  includes `branchPattern` so Claude knows the format.
- `write-apply.js`, grill phase, GitHub on, before writing anything:
  - `Branch` is required and must match
    `^(feat|fix|refactor|docs|chore|perf|test)/[a-z0-9]+([._-][a-z0-9]+)*$`
    (max 80 characters) and pass `git check-ref-format --branch`.
  - It must not already exist locally.
  - HEAD must be on a branch (detached HEAD is refused).
  - Failures join the usual `❌` payload error list; the payload stays for a retry.
- Then `git switch -c <branch>` (uncommitted changes carry over). If it fails,
  nothing is written. On success, `resume.md` is written and the config gets
  `git: { branch, base_branch, branch_created_at }`. The `✅` line names the branch.
- A `Branch` field in the payload when GitHub is off is ignored.

## Finish (`/gps finish`)

After the existing checks, when `config.git` is set:

1. Refuse (change nothing) if the current branch is not `git.branch`.
   Uncommitted changes print a `⚠️` (they won't be in the PR) but don't block.
2. `git push -u origin <branch>`.
3. `gh pr create --base <base_branch> --head <branch> --title <title> --body-file <tmp>`.
   - Title: `<type>: <feature name>`, `type` from the branch prefix.
   - Body: the resume's Problem Statement, the ticket list (or "bounded"), the
     commits `base_branch..branch`, and the Claude Code attribution line.
   - The PR URL is the last `https://` line of gh's output.
4. INDEX.md gets a `## Branch & PR` section: branch, base, PR link. If the push
   or `gh` failed (or `gh` is missing), the section lists the exact commands to
   run by hand and finish prints `⚠️` but still succeeds.
5. `git.pr_url` is saved (or `null` on failure).

Sessions created before this feature, or in non-GitHub projects, have no
`config.git` and finish exactly as before.

## Status

`summarizeSession` adds `branch` and `prUrl` (both `null` when absent).

## Testing

- `github.test.js`: remote URL parsing, branch-name validation, `createSessionBranch`
  in a temp repo (base recorded, dirty changes carried, existing branch refused),
  `openPullRequest` with stub `gh` on PATH and a bare repo as `origin`.
- `e2e`: a GitHub-origin session (origin URL set via `url.<bare>.insteadOf`)
  going start → write(grill with Branch) → finish, with a stub `gh` that
  records its arguments and prints a PR URL; INDEX.md and config carry the URL.
- Existing non-GitHub tests keep passing unchanged.
