# status.js --json is a versioned contract for outside tools

_ADR 0001, recorded 2026-11-13 (session 2026-11-13__gps-dashboard-support)._

<!-- Format adapted from mattpocock-skills' domain-modeling (ADR-FORMAT.md): https://github.com/mattpocock/skills.git -->

gps-dashboard reads `status.js --json` and `help.js --json`, while agents may run an older plugin-cache copy of gps, so the JSON is a contract: it carries `schemaVersion` (2 with this change; absent means 1) and `gpsVersion`, is documented in `docs/STATUS-JSON.md`, and any rename or removal of a field bumps `schemaVersion`, while adding fields does not. The first bump replaces `tickets[].done` with `tickets[].state`; readers must handle both versions while older gps copies are in use.
