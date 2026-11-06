# Ticket 02: redetect-saved-version-files

**Status:** ✅ Done

## Local Test Result

`node tests/lib/project-config.test.js && node tests/release.test.js` -> both "all assertions passed", exit 0. Also config.test.js and skill.test.js pass.

## Review Notes

Base commit 999ae001fa1750461bf32396fee879984e807316. Review rounds: 0.

- AC1: saveVersionFiles(root, files, source = 'detected') writes versionFilesSource; releaseSettings returns it (default 'detected'). Tested for a first release and in the lib.
- AC2: release.js detects again unless a saved list is manual; saves (and commits the config) when the list is new or differs. A legacy config with ['package.json'] and a root plugin.json gets both files, a warning naming plugin.json, and the config in the release commit. A legacy list that already matches is not rewritten (no source key added, no config churn).
- AC3: manual list is used as is, config untouched, not in the commit (test).
- AC4: validation refuses other values (project-config test).
- releaseSettings gained a field, so three existing deepStrictEqual assertions were updated.

**Parent review record.** Base 999ae001fa1750461bf32396fee879984e807316. Correction pass 1 (parent finding P1 release.js: re-detection replaced the saved list and dropped custom entries): made additive, saved entries first, regression test added; the implementer was cut off by a host restart after the edits, so the parent ran verification and wrote this record. Verification Step exit 0; npm test 140/140. Fresh independent reviewer (delivery change): one P3, release.js:246, the "saved list updated" warning also prints on the preview path. Disposition: deferred, wording only, reported to the user. Accepted: all Acceptance Criteria met, no unresolved actionable finding.

## Blockers / Challenges

None

## Commits

- f3953a3 feat: re-detect version files saved by detection on each release (ticket 02)

## Time Spent

17m (ticket-start.js to ticket-complete.js)
