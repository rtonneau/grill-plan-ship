# Ticket 05: docs-and-live-evidence

**Status:** ✅ Done

## Local Test Result

`claude plugin validate .`: Validation passed. `npm test`: 144 pass, 0 fail (`.scratch/tests/2026-11-27__agent-definitions-for-gps/05-npm-test.txt`). Size check: GPS 78, Idea 64 lines.

Live (disposable repo `.scratch/tests/2026-11-27__agent-definitions-for-gps/live`): `claude -p --plugin-dir <repo> --model haiku --permission-mode bypassPermissions` spawning `grill-plan-ship:gps-reviewer` succeeded; child lacked Write/Edit/Agent but wrote a file via Bash (`05-live-reviewer.txt`). Without --plugin-dir: `Agent type ... not found` (`05-live-fallback.txt`).

## Review Notes

Mode: inline. Review base: 6569bef77ba95bab4f2b869ee8c7060d1c211725. Pre-existing changes: none outside `.work/`.

- COMPATIBILITY: new dated section with labeled Live/Fixture/NOT TESTED rows; platform row updated.
- ARCHITECTURE: layer table + Roles and agent definitions paragraph; audit row reworded.
- README: command rows for --review, Other roles and Agent definitions paragraphs, layout and script row.
- AGENTS.md: agents/ in layout, decision 0019 in the list.
- The Bash-write gap is stated plainly everywhere it is described. Recovery count: 0.

## Blockers / Challenges

The live probe confirmed the Bash gap the design anticipated; documented, not changed (removing Bash would cost git access, rejected in the grill).

## Commits

- 5ae11e0 docs: role agents, fallback and live evidence (ticket 05)

## Time Spent

5m (ticket-start.js to ticket-complete.js)
