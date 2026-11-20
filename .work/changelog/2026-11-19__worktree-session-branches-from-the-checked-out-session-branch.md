---
bump: minor
floor: minor
---
- `/gps start --worktree` no longer stacks a new session on another session's branch: when the checked-out branch belongs to an unfinished session, the worktree branches from that session's base instead (the default branch, with a warning, if that base is unknown). The `.work/gps-config.json` check now reads that base.
- `/gps start --worktree --base <branch>` stacks a session on a chosen branch on purpose.
