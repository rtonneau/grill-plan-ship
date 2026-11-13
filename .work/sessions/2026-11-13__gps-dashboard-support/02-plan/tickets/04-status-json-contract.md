# Ticket 04: status-json-contract

**Model:** medium
**Effort:** medium

**Acceptance Criteria:**
- [ ] `docs/STATUS-JSON.md` documents `status.js --json` and `help.js --json` (every top-level, session, current, ticket, worktree and command field), problem codes, history event names including `ticket_resumed`, and the rule: renaming or removing a field bumps `schemaVersion`, adding one does not; absent `schemaVersion` means v1.
- [ ] A test runs both scripts in a throwaway project and fails when a field they print is missing from the doc.
- [ ] `docs/decisions/0018-status-json-is-a-versioned-contract.md` records the decision; README and `docs/ARCHITECTURE.md` point to the doc; AGENTS.md names it in the layout.

**Files to Touch:**
- `docs/STATUS-JSON.md`
- `docs/decisions/0018-status-json-is-a-versioned-contract.md`
- `tests/status-json-doc.test.js`
- `README.md`
- `docs/ARCHITECTURE.md`
- `AGENTS.md`

**Verification Step:**

Run:
```bash
node tests/status-json-doc.test.js && npm test
```

Expected:
All tests pass.

**Notes:**

Match the style of `docs/WORK-DIR.md`. Note in the doc that gps-dashboard is a known reader.
