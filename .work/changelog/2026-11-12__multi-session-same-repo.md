---
bump: minor
floor: minor
---
- `/gps start --worktree` runs a session in its own git worktree and branch, so several sessions can run in parallel on one repository (requires `/gps init`); saving the plan renames the worktree's provisional branch to the plan's branch name.
- `/gps status` lists the sessions active in other worktrees, and `/gps start` warns when another session is still unfinished in the checkout.
- `/gps finish` in a worktree session keeps the branch checked out, opens the pull request on GitHub or prints merge steps otherwise, and prints the `git worktree remove` command.
