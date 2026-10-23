# Ticket 01: scratch-build-tree-rule

**Status:** ✅ Done

## Local Test Result

`node --test tests/lib/scratch-dir.test.js`: pass 1, fail 0 (the file is one plain-assert script, like the other lib tests).

## Review Notes

Implemented by a subagent (Sonnet, effort high). Checked against every criterion: name rule incl. build-*/build_* and near misses (builder, buildlogs, bin, out), the CMakeCache.txt marker, extraDirs, dirSize without following symlinks, the three policies, the missing-dir no-op, and the injected remover collecting failures. Also exports CLEAN_POLICIES. After review: fixed a stray spacing change on `gitignorePathOf`.

## Blockers / Challenges

None

## Commits

- d2eb61c feat: scratch build-tree rule and cleanScratch (ticket 01)

## Time Spent

2m (ticket-start.js to ticket-complete.js)
