# Implementation Plan

**Session:** Remove gps state files from .gitignore so they sync to GitHub
**Date:** 2026-10-28T08:33:38.002Z
**Estimated effort:** 2 hours

## Strategy

Stop ignoring the four state files in the plugin, migrate old projects through `/gps init`, then align the docs. Code and tests first (ticket 1), this repo's `.gitignore` and comments next (ticket 2), docs and the decision record last (ticket 3).

## Tickets Overview

- **Ticket 1:** `LOCAL_ONLY` shrinks to `.scratch/`; `/gps init` detects and strips the stale lines.
- **Ticket 2:** Remove the four lines from this repo's `.gitignore`, fix comments, and test that `commitWorkDir` commits the files.
- **Ticket 3:** Decision record 0012 and doc updates.

## Sequencing Rationale

Ticket 2 depends on ticket 1, because the tests that exercise `.gitignore` need the new `LOCAL_ONLY`. Docs come last so they describe the final behavior.

## Risks & Mitigation

- **Risk:** `.current-session` churn and conflicts across machines → **Mitigation:** accepted in decision 0012.
- **Risk:** payloads land in history between prepare and apply → **Mitigation:** accepted in decision 0012.
- **Risk:** `/gps init` strips a user's own lines → **Mitigation:** it removes only the four exact entries, and a test covers an unrelated user edit.

## Assumptions

- `commitWorkDir` needs no code change; it commits whatever is not ignored under `GPS_WORK_PATHS`.
- `/gps start` leaves existing `.gitignore` files alone; only `/gps init` migrates.
