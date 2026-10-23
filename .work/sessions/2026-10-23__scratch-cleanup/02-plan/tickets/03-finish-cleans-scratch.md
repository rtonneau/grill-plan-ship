# Ticket 03: finish-cleans-scratch

**Model:** medium
**Model (Jev):** sonnet-5.5 (confidence 0.39)
**Effort:** high

**Acceptance Criteria:**
- [ ] After a successful finish (planned or bounded session), `finish.js` applies `scratchSettings().cleanupOnFinish` to the session scratch dir via `cleanScratch`.
- [ ] It runs after the `session_finished` event and before the `.work/` commit, and records a `scratch_cleaned` event (`detail: { policy, removed, freedBytes }`) with `recordEvent`, so the event is part of the committed record. With policy `none` or nothing to remove, no event is recorded.
- [ ] The output gets one line such as `🧹 Scratch: removed 3 build tree(s), freed 120.4 MB (policy build-artifacts)`; with `all`: `🧹 Scratch: removed .scratch/tests/<id> (…)`. Nothing is printed for `none` or when nothing was removed.
- [ ] Each failure goes through `warn()` naming the path left behind; the exit code and the rest of the finish are unchanged.
- [ ] `--json` data includes `scratch: { policy, removed, freedBytes, failures }`.
- [ ] A refused finish (unfinished ticket, already finished…) touches no scratch file.

**Files to Touch:**
- `skills/gps/scripts/finish.js`
- `tests/finish.test.js`

**Verification Step:**

Run:
```bash
node --test tests/finish.test.js
```

Expected:
All tests pass, including: default policy removes a `build/` tree and keeps `evidence/run.log`; `none` keeps everything; `all` removes the dir; a refused finish keeps the scratch dir.

**Notes:**

Drive sessions through the scripts (`tests/helpers.js`), never by writing state by hand. Set policies in tests by writing `.work/gps-config.json` the way the existing config tests do. Update the header comment of `finish.js` to mention the cleanup.
