# Ticket 02: start-reference-resume-flow

**Model:** fast
**Model (Jev):** haiku-5.5 (confidence 0.52)
**Effort:** low

**Acceptance Criteria:**
- [ ] `skills/gps/references/start.md` step 1 handles the resume output. Not current: ask "Continue session X?" with the host question rule (continue first, Recommended); yes → `set-current.js <id>`, then continue from its phase; no → stop and suggest another name. Already current: no question, continue directly.
- [ ] Continuing in the grill phase reruns the grill, opening with the feature name, the session's HANDOFF.md if any, and the glossary/ADRs, and tells the user the earlier conversation was not saved. Other phases follow the printed `Next:`.
- [ ] File stays ≤ 40 lines; `tests/skill.test.js` passes.
- [ ] README's `/gps start` row mentions that an unfinished session of the same name is resumed.

**Files to Touch:**
- `skills/gps/references/start.md`
- `README.md`

**Verification Step:**

Run:
```bash
node --test tests/skill.test.js
```

Expected:
All tests pass, 0 failures.

**Notes:**

Keep the wording short; the router already holds the host question rule, so refer to it.
