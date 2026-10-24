# Ticket 02: auto-route-ship-chains-finish

**Model:** medium
**Model (Jev):** sonnet-5.5 (confidence 0.42)
**Effort:** high

**Acceptance Criteria:**
- [ ] `computeRoute` in `lib/auto-route.js` takes an `autoFinish` option; with target `ship` and `autoFinish` true, the steps end with `ship → finish`; with `autoFinish` false they stop at `ship`. Targets `plan` and `finish` are unchanged.
- [ ] `auto-route.js` passes `shipSettings(projectRoot).autoFinish` and, when it appended finish to a `ship` target, prints one line saying finish follows because `ship.autoFinish` is on.
- [ ] Tests cover target ship with the setting on (default) and off (`ship.autoFinish: false` in `.work/gps-config.json`), in both `tests/lib/auto-route.test.js` and `tests/auto-route.test.js`; existing target-ship expectations are updated for the new default.

**Files to Touch:**
- `skills/gps/scripts/lib/auto-route.js`
- `skills/gps/scripts/auto-route.js`
- `tests/lib/auto-route.test.js`
- `tests/auto-route.test.js`

**Verification Step:**

Run:
```bash
npm test
```

Expected:
All tests pass.

**Notes:**

Depends on ticket 01's `shipSettings`. `TARGET_LAST_STEP.ship` stays `ship`; add finish after slicing when the option is on, so the "target already done" check is unaffected. Keep the route's `target` reported as `ship`.
