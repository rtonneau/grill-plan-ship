# Ticket 04: status-json-contract

**Status:** ✅ Done

## Local Test Result

`node tests/status-json-doc.test.js && npm test`: "status-json-doc.test.js: all assertions passed"; `npm test` ends `# pass 144`, `# fail 0` (log in `.scratch/tests/2026-11-13__gps-dashboard-support/04-npm-test.log`); `node tests/check-skill-size.js --max 200` passes.

## Review Notes

Inline, docs plus one test, assessed directly. Base `d9e3f15fd01c9af6db3aa57632b8b318d7cc087a`; no pre-existing changes. `docs/STATUS-JSON.md` documents both JSON outputs field by field, the problem codes (with `no-work-dir`), every event name (with `ticket_resumed` and `branch_renamed`), ticket states, the worktree entry and the versioning rule (absent `schemaVersion` = v1). The test builds a project with seeds, a blocked ticket, a handoff and a second worktree, collects every key both scripts print (skipping data-keyed `meta`, `sections`, `detail` and writeTarget's path extras) and fails on any key no code span names; it also checks problem codes from session-store.js, events from every script, TICKET_STATES and SCHEMA_VERSION. Decision 0018 written; README layout, AGENTS.md layout and decision list, and the ARCHITECTURE component audit point to the doc. Verified gitLog order, staleness labels and branch_renamed against the code before documenting them.

## Blockers / Challenges

The first field check only accepted a field written alone in backticks; it now accepts a whole word inside any code span (`{ command, why }`).

## Commits

- d56c8f4 docs: document the status JSON contract (ticket 04)

## Time Spent

5m (ticket-start.js to ticket-complete.js)
