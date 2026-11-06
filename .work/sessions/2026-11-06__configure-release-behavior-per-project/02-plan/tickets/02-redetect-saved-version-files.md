# Ticket 02: redetect-saved-version-files

**Model:** medium
**Effort:** medium

**Acceptance Criteria:**
- [ ] A release saves `release.versionFilesSource: "detected"` beside the list it saves.
- [ ] With source `detected` or absent (legacy config), each release re-detects and updates the saved list in the release commit, so an old config picks up `[workspace.package]`.
- [ ] With source `manual`, the list is used as is and never re-detected.
- [ ] An invalid source value is refused by config validation.

**Files to Touch:**
- `skills/gps/scripts/lib/project-config.js`
- `skills/gps/scripts/release.js`
- `tests/lib/project-config.test.js`
- `tests/release.test.js`

**Verification Step:**

Run:
```bash
node tests/lib/project-config.test.js && node tests/release.test.js
```

Expected:
Both exit 0, including a regression test for a legacy config without the source key.

**Notes:**

This repo's own config lists `plugin.json` and the `.claude-plugin` files, all known files, so it stays correct when re-detected. A detected file a legacy list did not hold should be named in a warning.
