# Ticket 01: release-publish-flag

**Model:** inherit
**Effort:** medium

**Acceptance Criteria:**
- [ ] `release.js --publish` cuts the suggested version, then pushes and creates the GitHub Release by policy, in one call, asking nothing.
- [ ] `release.js --publish --version X.Y.Z` does the same with the given version; `--publish --push` is a usage error.
- [ ] A refusal stops before any later step; re-running after a failed push resumes (HEAD already the release commit with its tag goes straight to the push).
- [ ] `references/release.md` documents the preapproved path and still says never under `/gps auto`; SKILL.md table, README (command table, example, release section, network note) and `scripts/help.js` mention `--publish`.
- [ ] `npm test` and `node tests/check-skill-size.js --max 200` pass; references stay ≤ 40 lines.

**Files to Touch:**
- `skills/gps/scripts/release.js`
- `tests/release.test.js`
- `skills/gps/references/release.md`
- `skills/gps/SKILL.md`
- `skills/gps/scripts/help.js`
- `README.md`

**Verification Step:**

Run:
```bash
node tests/release.test.js && npm test && node tests/check-skill-size.js --max 200
```

Expected:
All tests pass and the size check reports within limits.

**Notes:**

Reuse the suggest and cut logic and `push()` in release.js; do not duplicate them. Follow the script rules in AGENTS.md (main() contract, GpsError/UsageError, usage string and options updated). Tests use the stub gh (`GPS_GH_BIN`) and a local bare repo as in the existing release tests. Do not commit; the parent commits.
