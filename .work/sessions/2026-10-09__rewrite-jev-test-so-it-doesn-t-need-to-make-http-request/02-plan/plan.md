# Implementation Plan

**Session:** rewrite JEV test so it doesn't need to make HTTP request requiering an authorization
**Date:** 2026-10-09T07:17:16.258Z
**Estimated effort:** 2 hours

## Strategy

Replace the local HTTP stub servers with a fake `globalThis.fetch`, so no test opens a listening socket. Build the fake and use it in the in-process unit test first, then in the child-process test, and only then remove the now-unused `GPS_JEV_BASE_URL` override from production code.

## Tickets Overview

- **Ticket 1:** Add `tests/fixtures/fake-fetch.js` and rewrite `tests/lib/jev.test.js` on top of it, with URL and Bearer assertions.
- **Ticket 2:** Rewrite `tests/jev-hints.test.js` to preload the fake via `NODE_OPTIONS`, and delete `http-stub-server.js`.
- **Ticket 3:** Remove `GPS_JEV_BASE_URL` from `lib/jev.js` and its doc mentions.

## Sequencing Rationale

Tickets 1 and 2 must land before 3: until the tests stop using `GPS_JEV_BASE_URL`, removing it would break them. Ticket 1 creates the fixture that ticket 2 reuses.

## Risks & Mitigation

- **Risk:** `NODE_OPTIONS` does not reach the child script through `tests/helpers.js` env merging. → **Mitigation:** check `h.run` env handling in ticket 2 and extend the helper minimally if needed.
- **Risk:** The fake's timeout case diverges from real abort behavior. → **Mitigation:** the fake rejects with the signal's reason when `AbortSignal` fires, as real `fetch` does.

## Assumptions

- Node's global `fetch` is what `lib/jev.js` calls (`lib/jev.js:120`).
- Historical docs under `docs/superpowers/` that mention `GPS_JEV_BASE_URL` stay as written (they record past work).
