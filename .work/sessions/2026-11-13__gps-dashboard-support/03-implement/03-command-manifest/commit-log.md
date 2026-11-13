# Ticket 03: command-manifest

**Status:** ✅ Done

## Local Test Result

`node tests/help.test.js && npm test`: "help.test.js: all assertions passed"; `npm test` ends `# pass 143`, `# fail 0` (log in `.scratch/tests/2026-11-13__gps-dashboard-support/03-npm-test.log`).

## Review Notes

Inline, no delegate: one lib table plus a merge in help.js, assessed directly. Base `1e9cd9e17325bcd7f2fa8fcd6a241a1983d6d987`; no pre-existing changes. Checked: `lib/commands.js` covers all 14 commands with `args` and `sendable` (true only for status, help, handoff, ship, auto, finish); `help.js --json` starts with `schemaVersion` and `gpsVersion` and each command gains `args`/`sendable`, existing fields unchanged; help.test.js fails when the manifest and SKILL.md's table name different commands, and checks every switch and enum value appears in the command's usage. Grammar: `flag` args list their switches in `values`; a value after a switch carries `flag` (`--from`, `--version`); `clean` ids carry `repeat`. Start's `--path`/`--branch` stay out because SKILL.md's usage does not show them.

## Blockers / Challenges

skill.test.js requires a test file per lib: added `tests/lib/commands.test.js` (not in the ticket's file list).

## Commits

- 5b01e7d feat: command manifest in help.js --json (ticket 03)

## Time Spent

6m (ticket-start.js to ticket-complete.js)
