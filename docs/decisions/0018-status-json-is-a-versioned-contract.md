# 0018: status.js --json is a versioned contract for outside tools

_Recorded 2026-11-13._

## Context

gps-dashboard reads `status.js --json` to show sessions and tickets, and queues gps commands on agent threads. Agents run a plugin-cache copy of gps that can be older or newer than the dashboard expects. So far the JSON had no version. Tickets were only done or not done, so the dashboard rebuilt blocked tickets from `.session-config.json` with its own copy of gps's event rules. A project without sessions produced no JSON at all, and the dashboard kept its own list of commands it may send.

## Decision

- `status.js --json` and `help.js --json` are a contract, documented in `docs/STATUS-JSON.md` and tested against it. Both start with `schemaVersion` and `gpsVersion`. Renaming or removing a field, or changing its meaning, bumps `schemaVersion`; adding a field does not. A missing `schemaVersion` means schema 1, the 3.1.x shape.
- Schema 2 replaces `tickets[].done` with `state` (`pending|started|blocked|done`) and `blocker`. It adds `current.recentEvents` and returns an empty report (exit 0) when there is no session. Text mode keeps failing in that case, because a person needs the hint.
- A block now ends: `ticket-start.js` records `ticket_resumed` when it resumes a blocked ticket. `blocked` means stuck now, not blocked at some point.
- `help.js --json` carries the command manifest (`lib/commands.js`): the argument grammar of each command and whether it is *sendable*, that is safe to queue on a thread that lacks the conversation which built the session.

## Alternatives rejected

- **Keep `done` beside `state`:** two fields for one fact, and readers have to choose between them. A version number handles the change better.
- **Let readers parse `.session-config.json`:** that file is gps's private state (WORK-DIR.md), and its event rules would be copied into every reader.
- **Put the manifest in each reference file:** the references would grow, and only scripts read it.

## Consequences

- Readers have to handle both schemas while agents still run 3.1.x copies.
- A breaking field change now costs a schema bump and a changelog line marking it breaking.
