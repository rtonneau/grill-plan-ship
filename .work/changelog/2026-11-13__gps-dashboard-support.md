---
bump: major
floor: major
---
- **Breaking:** `status.js --json` is now schema 2, documented in `docs/STATUS-JSON.md`. Both `status.js --json` and `help.js --json` start with `schemaVersion` and `gpsVersion`, and each ticket reports `state` (`pending`, `started`, `blocked` or `done`) and `blocker` instead of `done`. Tools reading the old shape should check `schemaVersion`.
- `status.js --json` lists the session's last 10 events (`current.recentEvents`) and returns an empty report (exit 0) in a project with no sessions; `/gps status` shows blocked tickets with their reason.
- Resuming a blocked ticket records a `ticket_resumed` event, so a ticket shows as blocked only while it is actually stuck.
- `help.js --json` describes each command's arguments and whether it can be queued on an agent thread (`sendable`), for tools such as gps-dashboard.
