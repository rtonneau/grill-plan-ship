# Ticket 03: plan-checker-role

**Acceptance Criteria:**
- [ ] `assets/role-plan-checker.md` briefs a read-only critique of the drafted plan payload against the grill resume: scope gaps, oversized or misordered tickets, missing or unprovable Verification Steps, criteria that are not testable; final line `CHECKED — findings|no findings` or `BLOCKED — …`.
- [ ] `dispatch-prompt.js --role plan-checker --host <claude|codex>` points the brief at the session's resume and its pending `.write-payload.md`, and refuses with a recovery hint when no plan payload exists.
- [ ] `agents/gps-plan-checker.md` exists (read-only limits).
- [ ] `references/plan.md` runs the checker for High-risk work or 4+ tickets after drafting and before showing the list (the payload is written first), and the parent revises tickets from findings it accepts.
- [ ] `npm test` passes.

**Files to Touch:**
- `skills/gps/assets/role-plan-checker.md`
- `agents/gps-plan-checker.md`
- `skills/gps/scripts/dispatch-prompt.js`
- `skills/gps/scripts/lib/host-dispatch.js`
- `skills/gps/references/plan.md`
- `tests/dispatch-prompt.test.js`

**Verification Step:**

Run:
```bash
npm test
```

Expected:
All tests pass.

**Notes:**

Payload path comes from `lib/write-payload.js` (`PAYLOAD_FILENAME`). Writing the payload before the check does not save the plan; `write-apply.js` still does that.
