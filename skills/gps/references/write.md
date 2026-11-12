# /gps write

**When:** the design or tickets were agreed in this conversation. `/gps plan`, `/gps ship` and `/gps auto` run these steps first when their phase is pending.

This is transcription: copy what was agreed, so nothing new reaches disk unreviewed.

1. `write-prepare.js`. If it says nothing is pending, relay it and stop.
2. Fill its skeleton and write it to the payload path it prints. On the plan phase of a GitHub project, name the `**Branch:**` after the plan yourself (e.g. `feat/dark-mode-toggle`); a worktree session's provisional branch is renamed to it unless already pushed.
3. `write-apply.js`. A `❌` with a list means nothing was written: fix those items in the payload and run it again. Relay its `✅`, `🌿` (session branch), `🗂️` (session record committed, plan phase) and `📌` (GitHub issue) lines.

A GitHub plan in a detached linked worktree works when GPS can identify one local branch at HEAD; it records that branch as the PR base. An ambiguous Git state is refused without consuming the payload.

**Example:** `/gps write`
