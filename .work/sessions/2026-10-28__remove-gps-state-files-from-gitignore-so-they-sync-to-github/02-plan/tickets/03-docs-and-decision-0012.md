# Ticket 03: docs-and-decision-0012

**Model:** fast
**Model (Jev):** haiku-5.5 (confidence 0.39)
**Effort:** high

**Acceptance Criteria:**
- [ ] `docs/decisions/0012-state-files-are-synced.md` records the reversal and the accepted costs: pointer churn, payloads in history, one-time first commit.
- [ ] `docs/WORK-DIR.md` and the session files paragraph of `.claude/CLAUDE.md` say these files sync; the CLAUDE.md decisions list names 0012.
- [ ] README mentions are updated.

**Files to Touch:**
- `docs/decisions/0012-state-files-are-synced.md`
- `docs/WORK-DIR.md`
- `.claude/CLAUDE.md`
- `README.md`

**Verification Step:**

Run:
```bash
node tests/skill.test.js
```

Expected:
all tests pass.

**Notes:**

Match the style of decisions 0008 and 0011.
