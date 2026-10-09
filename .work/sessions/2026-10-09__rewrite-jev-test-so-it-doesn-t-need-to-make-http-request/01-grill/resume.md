# Session: rewrite JEV test so it doesn't need to make HTTP request requiering an authorization

**Date:** 2026-10-09T07:13:52.732Z
**Status:** Grill phase complete

## Problem Statement

Running the Jev tests on Windows makes the firewall ask to let node.js accept connections. The prompt is unnecessary and feels unsafe. It comes from the tests opening listening sockets: `server.listen(0)` in `tests/lib/jev.test.js`, and the stub-server child process in `tests/jev-hints.test.js`. No test calls the real API; the issue is the local listeners.

## Context & Constraints

- **Current behavior:** `jev.test.js` starts `http.createServer` stubs on 127.0.0.1 and points `GPS_JEV_BASE_URL` at them. `jev-hints.test.js` spawns `tests/fixtures/http-stub-server.js` as a separate process (so `spawnSync` doesn't block it) and sets the same env var for the child script.
- **Pain point:** Listening on a port triggers the Windows firewall prompt on every machine that runs the tests.
- **Dependencies:** `lib/jev.js` uses global `fetch` (`lib/jev.js:120`) and reads `GPS_JEV_BASE_URL` at `lib/jev.js:43`. Docs mentioning that variable: ADR 0005, the Jev design spec and plan, and CHANGELOG.
- **Tech stack:** Node.js built-ins only, `node --test`-style plain assert files, `tests/helpers.js` (`h.ok`, `h.json`, `h.run`) running real scripts via `spawnSync`.

## Success Metrics

- No test opens a listening socket (no `listen`, no stub server process); `npm test` raises no firewall prompt.
- All existing Jev cases still pass: success, family collapse for each MODEL_CRITERIA key, HTTP 500, missing key, unknown model/effort, prototype-chain names, timeout, unreachable, jev.enabled gating.
- Tests assert the request goes to `https://api.typesafe.ai/v1/systemone` with the `Authorization: Bearer <key>` header.

## Architecture & Approach

- New `tests/fixtures/fake-fetch.js` replaces `globalThis.fetch`. It reads its scripted behavior from env (JSON body, status, `hang`, `refuse`), records the URL and headers, and honors AbortSignal so the timeout test works.
- `tests/lib/jev.test.js`: swap `fetch` in-process, drop the `http` stub servers, keep every case, add the URL and header assertions.
- `tests/jev-hints.test.js`: run the child script with `NODE_OPTIONS=--require <path>/fake-fetch.js`; the unreachable case uses `refuse`. Remove the `startStub` helper.
- Delete `tests/fixtures/http-stub-server.js`.
- Remove `GPS_JEV_BASE_URL` from `lib/jev.js` (endpoint fixed) and from docs, ADR and spec mentions.
- Changelog fragment through the normal finish flow.

## Assumptions & Trade-offs

- No production seam is added: the preload swaps global `fetch`, so shipped code gets no test back door.
- Removing `GPS_JEV_BASE_URL` drops a proxy or self-hosted override; chosen because it would be untested and unused.
- Not doing: calling the real Jev API in tests, or changing Jev classification behavior.

## Open Questions

- None. Check that `NODE_OPTIONS` passes cleanly through `tests/helpers.js` env merging.

## Notes

Decisions made with the user: goal is removing listening sockets (not auth to the real API); preload via NODE_OPTIONS chosen over an injectable fetch parameter or an env hook; `GPS_JEV_BASE_URL` is removed.
