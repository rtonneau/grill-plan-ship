# Ticket 04: clean-removes-scratch

**Model:** medium
**Model (Jev):** sonnet-5.5 (confidence 0.31)
**Effort:** high

**Acceptance Criteria:**
- [ ] `clean.js --delete <session>` also deletes `.scratch/tests/<session>` when it exists.
- [ ] `clean.js` (list mode) shows a `## Orphan scratch dirs` table (dir and size) for each `.scratch/tests/<id>` with no matching session dir. The current session's scratch dir is never an orphan.
- [ ] An orphan scratch dir id is accepted by `--dry-run` / `--delete`, validated with the other ids before anything is removed, and deleted on `--delete` (`✅ Deleted scratch dir .scratch/tests/<id>.`).
- [ ] `--dry-run` shows the scratch path and size for each session that has one, and for each orphan.
- [ ] `--json` data includes `orphanScratch` in list mode and the scratch paths in the plan.
- [ ] The "Never touched" line and the no-ids message stay accurate (e.g. nothing to clean only when there are no sessions, ideas or orphans).

**Files to Touch:**
- `skills/gps/scripts/lib/clean.js`
- `skills/gps/scripts/clean.js`
- `tests/lib/clean.test.js`
- `tests/clean.test.js`

**Verification Step:**

Run:
```bash
node --test tests/lib/clean.test.js tests/clean.test.js
```

Expected:
All tests pass, including: deleting a session removes its scratch dir; an orphan is listed, sized in the dry run and deleted; an unknown id is still refused before anything is removed.

**Notes:**

`planDeletion` currently takes `sessionsDir`; it now also needs the project root to find `.scratch/tests`. Reuse `dirSize` / `formatBytes` from `lib/scratch-dir.js` (ticket 01). An id that is both a session and an orphan cannot happen (orphan means no session).
