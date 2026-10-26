---
bump: minor
floor: minor
---
- `/gps start <name>` on a session of the same name that is not finished (started today or on an earlier day) no longer fails or creates a duplicate: it reports the session's phase, tickets and last activity, asks whether to continue, and picks up from that phase.
- `set-current.js` and the "nothing to write" messages of `/gps write` now name the next command (`/gps ship`, `/gps finish`, …) instead of sending you to `/gps status`.
