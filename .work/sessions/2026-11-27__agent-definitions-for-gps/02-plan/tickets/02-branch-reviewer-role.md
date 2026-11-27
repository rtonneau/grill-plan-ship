# Ticket 02: branch-reviewer-role

**Acceptance Criteria:**
- [ ] `assets/role-branch-reviewer.md` briefs a read-only review of the whole session diff from a recorded full base SHA against the plan and tickets, with the same finding format and final-line contract as the ticket reviewer.
- [ ] `dispatch-prompt.js --role branch-reviewer --base <full-sha> --host <claude|codex>` works without a ticket number and is refused with a usage error when the base is missing or not a full SHA; ticket roles still require a number.
- [ ] `agents/gps-branch-reviewer.md` exists (read-only limits).
- [ ] `auto-route.js --review` is accepted, recorded on the `auto_started` event and printed; it warns and is ignored when the route has no finish step.
- [ ] `references/finish.md` and `references/auto.md` describe `--review`: freeze, dispatch, one parent fix pass and fresh re-review, stop before `finish.js` on unresolved findings; plain and chained finishes never run it. SKILL.md's command table shows the flag.
- [ ] `npm test` and `node tests/check-skill-size.js --max 200` pass.

**Files to Touch:**
- `skills/gps/assets/role-branch-reviewer.md`
- `skills/gps/assets/role-context.md`
- `agents/gps-branch-reviewer.md`
- `skills/gps/scripts/dispatch-prompt.js`
- `skills/gps/scripts/lib/host-dispatch.js`
- `skills/gps/scripts/auto-route.js`
- `skills/gps/references/finish.md`
- `skills/gps/references/auto.md`
- `skills/gps/SKILL.md`
- `tests/dispatch-prompt.test.js`
- `tests/auto-route.test.js`

**Verification Step:**

Run:
```bash
npm test && node tests/check-skill-size.js --max 200
```

Expected:
All tests pass; the size check reports no file over its limit.

**Notes:**

The ticket context template is ticket-specific; split a session-level context (repo, session, scratch dir, permission rules) from the ticket header so non-ticket roles reuse the permission lines verbatim. References stay at 40 lines or fewer.
