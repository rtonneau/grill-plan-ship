# Ticket 06: docs-scratch-cleanup

**Model:** fast
**Model (Jev):** haiku-5.5 (confidence 0.45)
**Effort:** low

**Acceptance Criteria:**
- [ ] `docs/decisions/0008-scratch-cleanup-on-finish.md` records: default `build-artifacts`, a name rule rather than citation tracking (with the CTest-log example and the brief mitigation), and warn-don't-fail at finish.
- [ ] `README.md` documents `scratch.cleanupOnFinish` (none / build-artifacts / all) and `scratch.extraDirs`, the built-in names, and that `/gps clean` removes scratch dirs and orphans.
- [ ] `skills/gps/references/clean.md` mentions orphan scratch dirs and sizes in the dry run; `skills/gps/references/finish.md` mentions the scratch cleanup and its `🧹`/`⚠️` lines. Both stay ≤ 40 lines.
- [ ] `.claude/CLAUDE.md` lists decision 0008 in the docs/decisions line.

**Files to Touch:**
- `docs/decisions/0008-scratch-cleanup-on-finish.md`
- `README.md`
- `skills/gps/references/clean.md`
- `skills/gps/references/finish.md`
- `.claude/CLAUDE.md`

**Verification Step:**

Run:
```bash
npm test
```

Expected:
All tests pass (the skill test checks reference sizes).

**Notes:**

Match the format of the existing decisions (read 0007 first). No changelog edit here: `/gps finish` writes the session's fragment.
