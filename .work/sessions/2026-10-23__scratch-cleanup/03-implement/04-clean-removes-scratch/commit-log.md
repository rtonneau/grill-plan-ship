# Ticket 04: clean-removes-scratch

**Status:** ✅ Done

## Local Test Result

`node --test tests/lib/clean.test.js tests/clean.test.js`: pass 2, fail 0. Full `npm test` (run in review): pass 61, fail 0.

## Review Notes

Implemented by a subagent (Sonnet, effort high). Checked: --delete also removes `.scratch/tests/<session>`. Orphans (no session dir, never the current pointer) are listed with their size, accepted as ids, validated before anything is removed, and deleted. The dry run shows each scratch path and size. `--json` carries `orphanScratch` and `scratch` per session. The nothing-to-clean message counts orphans. `projectRoot` is an optional last parameter, so existing callers keep working. Outside the file list: `SCRATCH_ROOT` is now exported from scratch-dir.js for reuse. No changes after review.

## Blockers / Challenges

None

## Commits

- eb85b56 feat: /gps clean removes session and orphan scratch dirs (ticket 04)

## Time Spent

6m (ticket-start.js to ticket-complete.js)
