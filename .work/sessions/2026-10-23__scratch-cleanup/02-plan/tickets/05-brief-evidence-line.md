# Ticket 05: brief-evidence-line

**Model:** fast
**Model (Jev):** haiku-5.5 (confidence 0.64)
**Effort:** low

**Acceptance Criteria:**
- [ ] The prompt built by `dispatch-prompt.js` has one added line: build trees in the scratch dir are deleted at `/gps finish`, so copy any log or output you cite in the commit log into `<scratchDir>/evidence/`.
- [ ] The four `agents/gps-ticket-*.md` files get the same rule as one bullet, with bodies still identical (checked by `tests/skill.test.js`).

**Files to Touch:**
- `skills/gps/scripts/dispatch-prompt.js`
- `agents/gps-ticket-low.md`
- `agents/gps-ticket-medium.md`
- `agents/gps-ticket-high.md`
- `agents/gps-ticket-xhigh.md`
- `tests/dispatch-prompt.test.js`

**Verification Step:**

Run:
```bash
node --test tests/dispatch-prompt.test.js tests/skill.test.js
```

Expected:
All tests pass; the prompt test asserts the new line with the session's scratch dir.

**Notes:**

Place the bullet next to the existing "Keep build, run and test artifacts in the scratch directory" line.
