# Ticket 02: fake-fetch-jev-hints-test

**Model:** sonnet
**Model (Jev):** sonnet-5.5 (confidence 0.42)
**Effort:** medium

**Acceptance Criteria:**
- [ ] `tests/jev-hints.test.js` runs `jev-hints.js` with `NODE_OPTIONS=--require <abs path>/tests/fixtures/fake-fetch.js` and scripted env; the `startStub` helper is gone.
- [ ] The success case and the unreachable case (`refuse`) still pass; the unreachable case still expects the `⚠️  Jev call failed` warning.
- [ ] `tests/fixtures/http-stub-server.js` is deleted.
- [ ] No test file contains `listen(` or `GPS_JEV_BASE_URL`.

**Files to Touch:**
- `tests/jev-hints.test.js`
- `tests/fixtures/http-stub-server.js` (delete)
- `tests/helpers.js` (only if env passing needs it)

**Verification Step:**

Run:
```bash
node tests/jev-hints.test.js && npm test
```

Expected:
Both pass, with no firewall prompt.

**Notes:**

Use an absolute path in `NODE_OPTIONS` (quote it if the path has spaces).
