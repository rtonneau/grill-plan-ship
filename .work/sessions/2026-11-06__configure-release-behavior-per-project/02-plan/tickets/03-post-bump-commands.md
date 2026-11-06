# Ticket 03: post-bump-commands

**Model:** heavy
**Effort:** high

**Acceptance Criteria:**
- [ ] `release.postBump` (array of command strings) is validated and run in order from the project root, after version files are written and before the release commit.
- [ ] Every tracked file the commands modified joins the release commit; untracked files they create produce a warning and stay out.
- [ ] An unapproved or changed list refuses before anything is written, naming the commands; `release.js --approve-post-bump` records the exact list in the config and the config joins the release commit, so approval does not dirty the tree for the rerun.
- [ ] `--publish` refuses an unapproved list unless `--approve-post-bump` is passed too.
- [ ] A failing command restores the changelog, version files, config and fragments, commits and tags nothing, and reports the command and its output; a rerun then works.
- [ ] `references/release.md` shows the commands and asks once; `docs/WORK-DIR.md`, `docs/COMPATIBILITY.md` if host-facing and a new `docs/decisions/` record are updated; `references/release.md` stays within 40 lines.

**Files to Touch:**
- `skills/gps/scripts/release.js`
- `skills/gps/scripts/lib/project-config.js`
- `skills/gps/scripts/lib/git.js`
- `skills/gps/references/release.md`
- `docs/decisions/0017-release-post-bump-commands.md`
- `tests/release.test.js`
- `tests/lib/project-config.test.js`

**Verification Step:**

Run:
```bash
npm test
```

Expected:
All tests pass, including approval, changed-list refusal, commit inclusion and restore-on-failure cases.

**Notes:**

Run commands with `execFileSync` through the platform shell (they are shell strings by design) and capture their output so stdout stays the script's own. The file list comes from `git diff --name-only` after the commands; the tree was clean at the start. Check the next free decision number before naming the record.
