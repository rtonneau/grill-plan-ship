# Ticket 03: next-command-not-status

**Model:** medium
**Model (Jev):** sonnet-5.5 (confidence 0.5)
**Effort:** high

**Acceptance Criteria:**
- [ ] `set-current.js` prints `✅ Current session is now <id> (phase <phase>).` then `Next: <command> — <why>` from `computeSessionState(...).suggestedNext`; `--json` adds `phase` and `suggestedNext`.
- [ ] The `write-prepare.js` "complete" message and the `write-apply.js` "complete" hint name the session's real next command (`/gps ship` while tickets are pending, `/gps finish` when all are done) instead of `/gps status`.
- [ ] Tests updated or added in `tests/set-current.test.js`, `tests/write-prepare.test.js`, `tests/write-apply.test.js`; full `npm test` passes.

**Files to Touch:**
- `skills/gps/scripts/set-current.js`
- `skills/gps/scripts/write-prepare.js`
- `skills/gps/scripts/write-apply.js`
- `tests/set-current.test.js`, `tests/write-prepare.test.js`, `tests/write-apply.test.js`

**Verification Step:**

Run:
```bash
npm test
```

Expected:
All tests pass, 0 failures.

**Notes:**

`suggestNext` in `lib/phase.js` already maps phases to commands; reuse it rather than adding new strings.
