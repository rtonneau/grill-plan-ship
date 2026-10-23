# Ticket 02: scratch-config-settings

**Model:** fast
**Model (Jev):** haiku-5.5 (confidence 0.21)
**Effort:** medium

**Acceptance Criteria:**
- [ ] `project-config.js` validates an optional `scratch` object: `cleanupOnFinish` is one of `none`, `build-artifacts`, `all`; `extraDirs` is a list of non-empty strings that are plain names (no `/`, `\`, `.` or `..`). Anything else throws the usual `invalid(...)` error.
- [ ] `scratchSettings(projectRoot)` returns `{ cleanupOnFinish, extraDirs }` with defaults `build-artifacts` and `[]`, and never writes the file.
- [ ] `config.js` shows `scratch.cleanupOnFinish = <value>` and `scratch.extraDirs = <list or none>` read-only, next to the existing changelog/release lines, and includes `scratch` in `--json` data.

**Files to Touch:**
- `skills/gps/scripts/lib/project-config.js`
- `skills/gps/scripts/config.js`
- `tests/lib/project-config.test.js`
- `tests/config.test.js`

**Verification Step:**

Run:
```bash
node --test tests/lib/project-config.test.js tests/config.test.js
```

Expected:
All tests pass, including invalid-policy, invalid-extraDirs and default cases.

**Notes:**

Follow how `changelogSettings` / `releaseSettings` apply defaults on read. Export the policy list (e.g. `SCRATCH_POLICIES`) so ticket 03 does not repeat it.
