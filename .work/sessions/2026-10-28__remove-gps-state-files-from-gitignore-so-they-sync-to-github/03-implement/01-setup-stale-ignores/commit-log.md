# Ticket 01: setup-stale-ignores

**Status:** ✅ Done

## Local Test Result

`node tests/lib/setup.test.js && node tests/init.test.js`: both print "all assertions passed" (re-run in the main session).

## Review Notes

Implemented by a sonnet subagent (gps-ticket-high); I reviewed the full diff against the four Acceptance Criteria and re-ran the Verification Step. `LOCAL_ONLY` is `['.scratch/']`, `STALE_IGNORES` holds the four entries, `inspectSetup` flags them and is not ready, `applySetup` strips them with `removeGitignoreEntry` and returns `removed`, `init.js` reports it, and `start.js` only calls `ensureLocalIgnores`. No changes after review.

## Blockers / Challenges

`tests/github-flow.test.js` now fails at line 236: `.current-session` is committed on the feature branch, so it disappears after `git switch main`. This follows from the new behavior and is left for ticket 02, which will adjust that test.

## Commits

- 659b759 feat: stop ignoring gps state files; /gps init strips the stale .gitignore lines (ticket 01)

## Time Spent

6m (ticket-start.js to ticket-complete.js)
