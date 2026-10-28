# Ticket 03: docs-and-decision-0012

**Status:** ✅ Done

## Local Test Result

`node tests/skill.test.js`: all assertions passed (re-run in the main session); size check passes (SKILL.md 76 and 64 lines).

## Review Notes

Implemented by a haiku subagent; I reviewed the diff against the three Acceptance Criteria. Decision 0012 follows the layout of 0008/0011 and records the reversal and the accepted costs; WORK-DIR.md, the CLAUDE.md session-files paragraph and decisions list, and the two README passages now say the files sync and only `.scratch/` is ignored. No changes after review.

## Blockers / Challenges

None. The CHANGELOG entry for 2.x that says per-machine files stay ignored is a past release and was left alone.

## Commits

- 018b148 docs: decision 0012, state files are synced (ticket 03)

## Time Spent

2m (ticket-start.js to ticket-complete.js)
