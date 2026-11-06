# Ticket 01: release-publish-flag

**Status:** ✅ Done

## Local Test Result

`node tests/release.test.js && npm test && node tests/check-skill-size.js --max 200`: release tests pass (new --publish cases), npm test 140/140 pass, size check within limits (gps SKILL.md 78 lines).

## Review Notes

Checked each criterion: --publish (suggested and --version), --publish --push usage error (exit 2), failed push leaves the tagged release commit and re-run resumes at push without a second commit, a refusal (nothing to release) stops before any push. Docs updated in release.md (14 lines), SKILL.md, help.js and README (table, example, release section, network note, scripts table). Reused push() and the cut code (renamed cutRelease); no duplication.

## Blockers / Challenges

None

## Commits

- 42ee399 feat: add release --publish to cut and push in one call (ticket 01)

## Time Spent

18m (ticket-start.js to ticket-complete.js)
