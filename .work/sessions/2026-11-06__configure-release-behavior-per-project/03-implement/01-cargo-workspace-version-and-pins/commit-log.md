# Ticket 01: cargo-workspace-version-and-pins

**Status:** ✅ Done

## Local Test Result

Ran `node tests/lib/version-files.test.js && node tests/release.test.js`: both exit 0 ("version-files.test.js: all assertions passed", "release.test.js: all assertions passed"), with the new workspace and pin cases included. Also ran `npm test`: 140 tests, 140 pass, 0 fail.

## Review Notes

Base commit 49f4ff61bacf466e36bc66c46f07fcc5c570d102.

- AC1: `TOML_TABLES['Cargo.toml']` now accepts `package` and `workspace.package`; a root with `[workspace.package] version` is detected and bumped (lib test and release.test.js cut 0.3.0 to 0.4.0). `[package]` and `pyproject.toml` cases unchanged and still pass.
- AC2: new `rewriteCargoPins` in `lib/version-files.js` (members from `[workspace] members`: literal paths and trailing `/*` glob, `exclude` honored; other patterns warn). Handles inline tables and `[dependencies.foo]`-style sub-tables across dependencies, dev-, build-, target and workspace.dependencies. `release.js` calls it when Cargo.toml is a written version file, using the Cargo.toml version read before the bump, and adds the changed manifests to the release commit (also `data.pinFiles`). The release test checks they are in `HEAD`.
- AC3: pins with another version, registry deps without `path`, and an excluded member are left unchanged (lib and release tests); a root without `[workspace]` changes nothing.
- AC4: only the version value span is replaced, so CRLF and trailing comments survive (tested with CRLF root and member, `# keep`, `# c1` comments).
- Nothing changed after review. Remaining gap: a pin is matched only by exact equality with the previous version (not `^0.1.0` or `=0.1.0`), and multi-line inline tables or dotted keys (`foo.path = ...`) are not recognized; Cargo.lock is not touched.

**Parent review record.** Base 49f4ff61bacf466e36bc66c46f07fcc5c570d102; independent reviewer (delivery change), scope = ticket files. Finding: P3 lib/version-files.js workspaceManifests/rewriteCargoPins, member outside the project ("../shared") is rewritten then refused by commitFiles. Disposition: deferred, outside the ticket input domain; reported to the user. Parent re-ran the Verification Step: exit 0. Accepted: all Acceptance Criteria met, no unresolved actionable finding.

## Blockers / Challenges

None

## Commits

- 72b9e24 feat: bump Cargo workspace versions and path-dependency pins (ticket 01)

## Time Spent

13m (ticket-start.js to ticket-complete.js)
