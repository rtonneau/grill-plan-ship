# Ticket 01: cargo-workspace-version-and-pins

**Model:** medium
**Effort:** high

**Acceptance Criteria:**
- [ ] A root `Cargo.toml` with `[workspace.package] version` is detected and bumped; `[package]` and `pyproject.toml` behave as before.
- [ ] `release.js --version` rewrites path dependencies (member crates and `[workspace.dependencies]` entries with a `path`) whose `version` equals the previous workspace version, and commits the changed manifests in the release commit.
- [ ] A pin with a different version, or a registry dependency with no `path`, is left unchanged.
- [ ] Line endings and comments of edited TOML are preserved.

**Files to Touch:**
- `skills/gps/scripts/lib/version-files.js`
- `skills/gps/scripts/release.js`
- `tests/lib/version-files.test.js`
- `tests/release.test.js`

**Verification Step:**

Run:
```bash
node tests/lib/version-files.test.js && node tests/release.test.js
```

Expected:
Both exit 0, with new workspace and pin cases passing.

**Notes:**

Member crates come from `[workspace] members` in the root manifest; handle literal paths and a trailing `/*` glob, and warn on anything else rather than guessing. Dependencies appear as inline tables (`foo = { path = "../foo", version = "0.1.0" }`) or `[dependencies.foo]` sub-tables.
