# Implementation Plan

**Session:** gps-dashboard support
**Date:** 2026-11-13T07:36:02.755Z
**Estimated effort:** 1 day

## Strategy

Build the ticket-state model first (it adds the `ticket_resumed` event and a pure state helper), then expose it in the versioned `status.js --json` v2, then extend `help.js --json` with the command manifest, and finish with the contract doc that both JSON outputs are tested against. The gps-dashboard changes (design items 7–9) are a separate gps session in that repo after this one ships.

## Tickets Overview

- **Ticket 1:** Ticket state: `ticket_resumed` on resuming a blocked ticket, and a pure helper deriving pending/started/blocked/done plus the open blocker.
- **Ticket 2:** `status.js --json` schema v2: `schemaVersion`, `gpsVersion`, tickets with `state`/`blocker` instead of `done`, `current.recentEvents`, an empty report (exit 0) when there are no sessions; text shows blocked tickets.
- **Ticket 3:** Command manifest: `lib/commands.js` (argument grammar, `sendable`) merged into `help.js --json` with `schemaVersion` and `gpsVersion`, checked against SKILL.md.
- **Ticket 4:** `docs/STATUS-JSON.md` read contract with a test against both JSON outputs, a design decision record, and pointers from README and ARCHITECTURE.

## Sequencing Rationale

Ticket 2 reports the state ticket 1 derives; ticket 3 reuses ticket 2's version helper; ticket 4 documents and tests the final shapes of 2 and 3.

## Risks & Mitigation

- **Risk:** removing `tickets[].done` breaks gps code or tests reading the status JSON → **Mitigation:** `done` stays in `listTickets` (internal); only the status report maps it to `state`, and the suite runs after each ticket.
- **Risk:** `gpsVersion` reads the wrong `plugin.json` in a plugin cache layout → **Mitigation:** resolve it from the skill directory (`<skill>/../../plugin.json`), present in both host caches; null when absent, covered by a test.
- **Risk:** the manifest drifts from SKILL.md's command table → **Mitigation:** a test fails on any name mismatch.

## Assumptions

- `ticket-queue.js --json`, `ticket-start.js` and other scripts keep `done`; only `status.js --json` and `help.js --json` are the documented contract.
- `ticket_started` stays once per ticket; `ticket_resumed` is recorded only when the ticket has an open block.
- The installed plugin cache (3.1.1) keeps running this session's scripts; the change ships to agents at the next release.
