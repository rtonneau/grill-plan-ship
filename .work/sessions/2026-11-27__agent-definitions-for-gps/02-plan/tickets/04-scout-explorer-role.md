# Ticket 04: scout-explorer-role

**Acceptance Criteria:**
- [ ] `assets/role-scout.md` briefs a read-only exploration of one named architecture area toward an optional direction, reporting candidate findings (problem, solution, files, strength) without writing seeds.
- [ ] `dispatch-prompt.js --role scout --area "<area>" [--direction "<d>"] --host <claude|codex>` works with no current session and rejects `--area` on other roles.
- [ ] `agents/gps-scout.md` exists (read-only limits).
- [ ] `references/scout.md` lets the parent fan out one explorer per area when the codebase is too large to review in one context, and keeps merging and `scout-merge.js` with the parent.
- [ ] `npm test` passes.

**Files to Touch:**
- `skills/gps/assets/role-scout.md`
- `agents/gps-scout.md`
- `skills/gps/scripts/dispatch-prompt.js`
- `skills/gps/scripts/lib/host-dispatch.js`
- `skills/gps/references/scout.md`
- `tests/dispatch-prompt.test.js`

**Verification Step:**

Run:
```bash
npm test
```

Expected:
All tests pass.

**Notes:**

Run the scout dispatch test in a directory with no `.work/sessions`.
