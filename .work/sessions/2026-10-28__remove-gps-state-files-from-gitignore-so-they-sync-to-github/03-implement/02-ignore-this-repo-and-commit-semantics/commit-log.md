# Ticket 02: ignore-this-repo-and-commit-semantics

**Status:** ✅ Done

## Local Test Result

`npm test` (subagent run, log in the scratch evidence dir): 139 of 139 pass, exit 0.

## Review Notes

Implemented by a sonnet subagent; I reviewed the diff against the three Acceptance Criteria. The four lines are gone from `.gitignore` (`.scratch/` stays), the `commitWorkDir` and `start.js` comments now say the pointer, seeds and payloads are committed (`seeds-store.js` and `clean.js` never claimed they were ignored, so they are unchanged), and `tests/lib/git.test.js` checks `commitWorkDir` commits all four files. `tests/github-flow.test.js` was adjusted for ticket 01: after `git switch main` finish now says no session is selected; a stale pointer written by the test still covers the "not checked out" message. No changes after review.

## Blockers / Challenges

`tests/github-flow.test.js` failed after ticket 01 because the pointer is now committed on the session branch; fixed here. `npm test` exceeds 120 s, so it was run with a longer timeout.

## Commits

- 2cbf666 feat: sync gps state files in this repo; test commitWorkDir commits them (ticket 02)

## Time Spent

5m (ticket-start.js to ticket-complete.js)
