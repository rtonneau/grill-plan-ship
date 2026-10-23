# Ticket 02: scratch-config-settings

**Status:** ✅ Done

## Local Test Result

`node --test tests/lib/project-config.test.js tests/config.test.js`: pass 2, fail 0. Full `npm test`: pass 61, fail 0.

## Review Notes

Implemented by a subagent (Haiku, effort medium). Checked: optional `scratch` object validated (policy list, extraDirs as plain names; `.`/`..` rejected as exact names, `my.build` allowed; null rejected like the other keys), `scratchSettings` defaults to build-artifacts / [] without writing, `/gps config` shows both read-only and in --json. After review: `SCRATCH_POLICIES` now reuses `CLEAN_POLICIES` from scratch-dir.js instead of a second copy of the list.

## Blockers / Challenges

None

## Commits

- f625950 feat: validate and show scratch cleanup settings (ticket 02)

## Time Spent

3m (ticket-start.js to ticket-complete.js)
