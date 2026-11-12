# 0017: Parallel sessions run one per git worktree

## Context

Every gps command acts on the session named by the committed `.work/sessions/.current-session`, `chore(gps)` commits take all of `.work/sessions`, and saving a plan switches the checkout to the session branch. Two sessions in one checkout overwrite the pointer, sweep each other into their record commits, and move each other's work between branches.

## Decision

- Parallel sessions run one per git worktree. `/gps start --worktree [--path <dir>] [--branch <name>]` runs `git worktree add -b <type>/<slug>` (default `../<repo>-worktrees/<session-id>`) and creates the session inside it, with `config.git` (branch, base, `worktree_path`) recorded at once. One checkout still holds one active session at a time.
- The pointer stays committed, one per branch (decision 0012). `/gps finish` deletes it in its final `chore(gps)` commit, so merging several session branches leaves no pointer change to conflict on.
- `--worktree` requires `.work/gps-config.json` committed (`/gps init`): otherwise each worktree would add its own copy (different `detected_at`, an add/add conflict), and an untracked copy in the main checkout blocks the merge.
- The branch made at start is provisional: saving the plan renames it to the plan's `**Branch:**` (`git branch -m`), since the grill and plan name the change better than the words typed at start. Once the branch is pushed (or has a PR) it keeps its name. Small work (no plan) keeps the start name.
- Its finish never switches branch (the base is checked out elsewhere); on GitHub it pushes and opens the PR, otherwise it prints merge steps. gps never removes a worktree: finish prints the `git worktree remove` command.
- The glossary, ADRs and project config stay shared files, merged by git like any other.

## Alternatives rejected

- Several sessions in one checkout, picked per command: every command would need a session argument, and the plan-time branch switch cannot be shared safely.
- A per-worktree, uncommitted pointer: contradicts 0012 (any host resumes from the committed record).
- Glossary/ADR fragments merged later: extra machinery for conflicts that are rare and ordinary to resolve.
