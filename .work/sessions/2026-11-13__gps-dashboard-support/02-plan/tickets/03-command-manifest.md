# Ticket 03: command-manifest

**Model:** medium
**Effort:** medium

**Acceptance Criteria:**
- [ ] `lib/commands.js` lists every gps command with `args` (each `{ name, kind: 'flag'|'enum'|'ticket'|'text'|'path', values?, optional }`) and `sendable` (true only for status, help, handoff, ship, auto, finish).
- [ ] `help.js --json` has `schemaVersion` and `gpsVersion` at the top and each `commands[]` entry gains `args` and `sendable`; existing fields are unchanged.
- [ ] A test fails when a command in SKILL.md's table is missing from `lib/commands.js` or the reverse.

**Files to Touch:**
- `skills/gps/scripts/lib/commands.js`
- `skills/gps/scripts/help.js`
- `tests/help.test.js`

**Verification Step:**

Run:
```bash
node tests/help.test.js && npm test
```

Expected:
All tests pass, including manifest fields and the SKILL.md cross-check.

**Notes:**

Grammar per the design: `ship` takes an optional ticket number 1–99 and `--inline|--delegate`; `auto` takes optional `plan|ship|finish` and `--inline|--delegate`. `help` takes an optional command name or question (text). Sendable means safe to queue on a thread without the conversation that built the session.
