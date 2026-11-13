# Session: gps-dashboard support

**Date:** 2026-11-13T07:23:34.769Z
**Status:** Grill phase complete

## Problem Statement

gps-dashboard (github.com/rtonneau/gps-dashboard, local at D:\DEV\AICODE\gps-dashboard) reads `status.js --json` and works around gaps in it: tickets are only done or not done, so it re-derives blocked and started tickets from `.session-config.json` `history[]` with a copy of gps's event rules; `status.js` exits 1 with no JSON when there are no sessions; the JSON carries no version, so the dashboard pins to 3.1.1 shapes while agents may run a different plugin-cache copy; and no machine-readable list says which gps commands can be queued on an agent thread or what arguments they take, so the dashboard hard-codes its own grammar. The new worktree sessions (`report.worktrees`) are not part of any documented contract.

## Context & Constraints

- **Current behavior:** `status.js --json` returns `sessions`, `seeds`, `current` (tickets with `done: boolean`), `currentProblem`, `suggestedNext` and, since the worktree work, `worktrees`; no sessions → `❌ No sessions found.`, exit 1. A block (`ticket-block.js`) leaves Status In Progress and records `ticket_blocked`; `ticket-start.js` records `ticket_started` only once, so resuming a blocked ticket leaves no trace and a block never ends until `ticket_done` or `session_finished`. `help.js --json` already lists commands (name, usage, summary, when, examples) from SKILL.md and the references.
- **Pain point:** the dashboard duplicates gps logic (`server/gps/history.ts`), cannot tell a ticket that is stuck now from one blocked once, breaks silently on shape changes, and keeps its own copy of the command grammar.
- **Dependencies:** gps-dashboard must keep working with the 3.1.1 output (schema v1) while agents still run older plugin-cache copies. gps commits only its own `.work/` paths (0002); the dashboard repo is changed in its own gps session there, started from this design after this one ships.
- **Tech stack:** gps: Node.js built-ins, CommonJS scripts on `lib/cli.js`, tests in `tests/`. gps-dashboard: TypeScript on Node ≥ 22.6, server in `server/`, web UI in `web/`.

## Success Metrics

- `status.js --json` prints `schemaVersion: 2` and `gpsVersion` (from the plugin's `plugin.json`, null when absent), and each `current.tickets[]` entry has `state` (`pending|started|blocked|done`) and `blocker {reason, at} | null` instead of `done`; `current.recentEvents` holds the last 10 history events.
- `ticket-start.js` on a blocked ticket records `ticket_resumed`; after it the ticket's state is `started`, and a test covers block → resume → done.
- `status.js --json` in a project with no `.work/sessions` or no sessions exits 0 with an empty report and `currentProblem.code` `no-work-dir` or `no-sessions`; text mode still prints `❌ No sessions found.` and exits 1.
- `help.js --json` carries `schemaVersion`, `gpsVersion` and, per command, an argument grammar and `sendable` (true for status, help, handoff, ship [N], auto [plan|ship|finish], finish); a test fails when `lib/commands.js` and SKILL.md's command table disagree.
- `docs/STATUS-JSON.md` documents every field, problem code, event name, `worktrees` and the versioning rule; a test fails when a top-level or ticket field is missing from it.
- `npm test` passes; the changelog fragment marks the change breaking.

## Architecture & Approach

GPS (this session):
1. Ticket state: a pure helper derives each ticket's state from its files (Done log → `done`, commit log present → `started`) and the session history (latest `ticket_blocked` with no later `ticket_resumed`, `ticket_done` or `session_finished` → `blocked`, with its reason and time). `status.js` reports `state` and `blocker`, dropping `done`; text output shows blocked tickets. `ticket-start.js` records `ticket_resumed` when it runs on a blocked ticket (still `ticket_started` only once). Other gps code that read `done` keeps working through the same helper.
2. `current.recentEvents`: the last 10 history events `{ at, event, phase, detail }`.
3. Empty project: `status.js --json` returns the empty report with `currentProblem` instead of throwing; text mode unchanged.
4. Versioning: `schemaVersion: 2` and `gpsVersion` at the top of `status.js --json` and `help.js --json`; `gpsVersion` read from `<skill>/../../plugin.json`.
5. Command manifest: `lib/commands.js` holds, per command, its argument grammar (flags, enums, ticket number 1–99, free text) and `sendable`; `help.js --json` merges it into each command entry; a test checks its names against SKILL.md's command table.
6. `docs/STATUS-JSON.md`: the read contract for outside tools (both JSON outputs, problem codes, history events, `worktrees`, the versioning rule: renaming or removing a field bumps `schemaVersion`, adding one does not); tests check field names against it. Changelog fragment marks the change breaking; the next `/gps release` should be a major version.

gps-dashboard (its own gps session, after this one):
7. Accept v1 (no `schemaVersion`: keep the `history.ts` path) and v2 (use `state`, `blocker`, `recentEvents`; no session-config read); show `gpsVersion`.
8. Send buttons and argument checks come from the manifest's sendable commands, within the server's fixed cap (status, help, handoff, ship, auto, finish); anything outside the cap is refused.
9. Worktree sessions: each session (main checkout or worktree) is listed under its project with the threads whose `worktreePath` matches its checkout; `worktreePath` is cached per thread (only `t3 thread show` returns it) and re-checked with `show` at send time; the confirm dialog names the session and its path; the server refuses a send whose thread's checkout doesn't match the chosen session.

## Assumptions & Trade-offs

- Breaking the JSON is accepted: `done` is removed rather than kept as a duplicate; `schemaVersion` tells readers which shape they got, and the dashboard handles both.
- A block ends on resume (`ticket_resumed`), done or finish; there is no separate unblock script.
- "Sendable" means safe to queue on a thread without the conversation that built the session; commands that need that conversation or the user (start, plan, write, scout, release, clean, config, init) are not sendable.
- The manifest lives in a lib table, not parsed from the references, so references don't grow.
- Not doing: a lighter multi-project status mode, interrupting or answering threads, any dashboard write of gps state.

## Open Questions

None.

## Notes

Glossary terms added: Ticket state, Blocked ticket, Sendable command, Status schema. ADR 0001 records that the status JSON is a versioned contract. Sources: gps-dashboard `docs/compatibility.md` §4–§6 and `server/gps/history.ts`.
