# Ticket 01: ship-autofinish-setting

**Model:** medium
**Model (Jev):** sonnet-5.5 (confidence 0.3)
**Effort:** high

**Acceptance Criteria:**
- [ ] `lib/project-config.js` validates an optional `ship` object: `ship.autoFinish` must be a boolean, else `invalid('"ship.autoFinish" must be true or false')`; a non-object `ship` is refused too.
- [ ] `lib/project-config.js` exports `shipSettings(projectRoot)` returning `{ autoFinish }`, default `true` when the file, the `ship` object or the key is missing; a read never writes the file.
- [ ] `config.js` shows `ship.autoFinish = <true|false>` read-only in its settings lines and returns it as `data.ship`; its header comment lists it.
- [ ] Tests cover default true, explicit false, invalid value, and the config.js line.

**Files to Touch:**
- `skills/gps/scripts/lib/project-config.js`
- `skills/gps/scripts/config.js`
- `tests/lib/project-config.test.js`
- `tests/config.test.js`

**Verification Step:**

Run:
```bash
node --test tests/lib/project-config.test.js tests/config.test.js
```

Expected:
All tests pass, including the new ship.autoFinish cases.

**Notes:**

Follow the `scratch` pattern exactly (validation block in `validate`, `scratchSettings`-style reader with defaults on read, read-only line in `config.js`). No command toggles it: users edit `.work/gps-config.json` by hand.
