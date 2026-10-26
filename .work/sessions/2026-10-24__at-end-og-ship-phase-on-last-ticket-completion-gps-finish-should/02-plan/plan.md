# Implementation Plan

**Session:** At end og ship phase, on last ticket completion, '/gps finish' should be called automatically
**Date:** 2026-10-24T06:53:03.318Z
**Estimated effort:** 2-3 hours

## Strategy

Add the `ship.autoFinish` setting first, then make `/gps auto ship` honor it, then change the references (ship, finish, auto) and record decision 0011. Scripts come before references, so each reference names behavior that already exists.

## Tickets Overview

- **Ticket 1:** `ship.autoFinish` setting (validated, default true, shown by `/gps config`).
- **Ticket 2:** `auto-route.js ship` appends finish when the setting is on.
- **Ticket 3:** ship/finish/auto references chain into an unattended finish; decision 0011, CLAUDE.md and README.

## Sequencing Rationale

Ticket 2 reads ticket 1's `shipSettings`; ticket 3 documents both and references the setting.

## Risks & Mitigation

- **Risk:** existing auto-route tests for target `ship` break with the new default → **Mitigation:** ticket 2 updates them and adds an explicit off case.
- **Risk:** references exceed the 40-line limit → **Mitigation:** terse wording; `tests/skill.test.js` checks sizes.

## Assumptions

- Chained finish uses `finish.js --keep-issue`, which already exists; no change to finish.js.
