---
bump: minor
floor: minor
---
- On Claude Code, gps children now run as plugin agents (`grill-plan-ship:gps-<role>`): reviewers and other read-only roles can't use Edit, Write or NotebookEdit, and no child can delegate further. Shell writes are still forbidden only by the brief. Without the plugin loaded, gps falls back to `general-purpose` and says so.
- `/gps finish --review` (and `/gps auto --review`) runs a read-only review of the whole branch before the pull request; actionable findings get one fix pass, and unresolved ones stop the finish.
- `/gps plan` has a read-only plan checker critique the drafted tickets against the grill for High-risk work or plans of 4 or more tickets.
- `/gps scout` can split a large codebase into areas, with one read-only explorer per area.
