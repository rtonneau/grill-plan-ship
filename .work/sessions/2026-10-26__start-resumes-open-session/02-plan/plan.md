# Implementation Plan

**Session:** start-resumes-open-session
**Date:** 2026-10-26T09:15:33.654Z
**Estimated effort:** 2-3 hours

## Strategy

Change the script first (start.js finds and reports an unfinished session with the same slug), then the reference that acts on its output, then the remaining `/gps status` detours in set-current and the write scripts.

## Tickets Overview

- **Ticket 1:** `start.js` reports an unfinished same-slug session (any date) instead of failing; the finished same-day collision hint drops `/gps status`.
- **Ticket 2:** `references/start.md` asks to continue (or continues directly when current) and resumes from the session's phase; README note.
- **Ticket 3:** `set-current.js`, `write-prepare.js` and `write-apply.js` print the real next command instead of `/gps status`.

## Sequencing Rationale

Ticket 2 describes the output ticket 1 produces and uses ticket 3's `set-current.js` output only loosely, so 1 comes first; 3 is independent but last so the full `npm test` run covers everything.

## Risks & Mitigation

- **Risk:** cross-day tests need sessions dated another day without hand-editing state → **Mitigation:** give `initSession` an optional `now` argument and drive it from lib tests.
- **Risk:** the resume path accidentally writes (history, pointer, seed, .gitignore) → **Mitigation:** test that nothing on disk changes on resume.

## Assumptions

- Session ids keep the `YYYY-MM-DD__<slug>` shape; older ids that don't match are simply never matched.
