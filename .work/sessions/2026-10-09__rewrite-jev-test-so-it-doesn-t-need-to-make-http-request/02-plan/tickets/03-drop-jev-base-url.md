# Ticket 03: drop-jev-base-url

**Model:** haiku
**Model (Jev):** haiku-5.5 (confidence 0.8)
**Effort:** low

**Acceptance Criteria:**
- [ ] `lib/jev.js` uses the fixed endpoint `https://api.typesafe.ai/v1/systemone` and no longer reads `GPS_JEV_BASE_URL`; its header comment now mentions only `GPS_JEV_TIMEOUT_MS`.
- [ ] `grep GPS_JEV_BASE_URL` finds nothing outside `docs/superpowers/` and CHANGELOG history.
- [ ] `npm test` passes.

**Files to Touch:**
- `skills/gps/scripts/lib/jev.js`

**Verification Step:**

Run:
```bash
npm test
```

Expected:
All tests pass.

**Notes:**

Keep `GPS_JEV_TIMEOUT_MS`; the timeout test still needs it.
