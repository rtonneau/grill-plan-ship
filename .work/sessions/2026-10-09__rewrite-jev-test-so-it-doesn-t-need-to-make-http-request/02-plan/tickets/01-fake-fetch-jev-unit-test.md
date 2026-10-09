# Ticket 01: fake-fetch-jev-unit-test

**Model:** sonnet
**Model (Jev):** sonnet-5.5 (confidence 0.46)
**Effort:** medium

**Acceptance Criteria:**
- [ ] `tests/fixtures/fake-fetch.js` replaces `globalThis.fetch`, records URL and headers, and supports a JSON body with status, `hang` (until AbortSignal fires) and `refuse` (rejects like a connection error).
- [ ] `tests/lib/jev.test.js` no longer requires `http`, calls no `listen`, and sets no `GPS_JEV_BASE_URL`.
- [ ] Every existing case is kept.
- [ ] The test asserts the URL is `https://api.typesafe.ai/v1/systemone` and the `Authorization` header is `Bearer test-key`.

**Files to Touch:**
- `tests/fixtures/fake-fetch.js`
- `tests/lib/jev.test.js`

**Verification Step:**

Run:
```bash
node tests/lib/jev.test.js
```

Expected:
`jev.test.js: all assertions passed`, with no firewall prompt.

**Notes:**

The fixture must work both when `require`d from a test and when preloaded with `--require` in a child process (ticket 2), so it reads its scripted behavior from env vars at call time and exposes a small helper for in-process use.
