# Ticket 01: scratch-build-tree-rule

**Model:** medium
**Model (Jev):** sonnet-5.5 (confidence 0.46)
**Effort:** high

**Acceptance Criteria:**
- [ ] `lib/scratch-dir.js` exports `BUILD_DIR_NAMES` and `isBuildTree(dirPath, name, extraDirs)`. A dir is a build tree if its name is `build`, `build-*`, `build_*`, `node_modules`, `CMakeFiles`, `__pycache__`, `.venv`, `venv`, `target`, `dist`, `obj`, `.gradle` or `.cache`, if it contains a `CMakeCache.txt`, or if its name is in `extraDirs`. `builder`, `buildlogs`, `bin` and `out` are not build trees.
- [ ] `dirSize(dirPath)` returns the total byte size of all files below a dir (0 for a missing dir), without following symlinks.
- [ ] `cleanScratch(projectRoot, sessionId, { policy, extraDirs })` returns `{ policy, removed: [relPaths], freedBytes, failures: [{ path, reason }] }`. `none` removes nothing. `build-artifacts` removes every matched tree whole (no descent into it) and keeps every other file. `all` removes the whole session scratch dir. A missing scratch dir is a no-op, not an error.
- [ ] A removal that throws is collected in `failures`; the function itself never throws for it.
- [ ] `formatBytes(n)` renders a human size (e.g. `0 B`, `12.3 KB`, `4.5 MB`).

**Files to Touch:**
- `skills/gps/scripts/lib/scratch-dir.js`
- `tests/lib/scratch-dir.test.js`

**Verification Step:**

Run:
```bash
node --test tests/lib/scratch-dir.test.js
```

Expected:
All tests pass, including cases for each policy, nested build trees (`a/b/build/`), a `CMakeCache.txt`-marked dir with an unrelated name, `extraDirs`, evidence files kept next to a removed tree, and a missing scratch dir.

**Notes:**

Node.js built-ins only. Paths in `removed` are project-relative with `/` separators, like `ensureScratchDir` returns. To test failures, inject the remover (e.g. an optional `rm` parameter) instead of locking real files. No caller yet; tickets 03 and 04 use it.
