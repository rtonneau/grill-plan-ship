# Ticket 03: post-bump-commands

**Status:** ✅ Done

## Local Test Result

Command: `npm test` (final run after the last edit).

Result: 140 tests, 140 pass, 0 fail (exit 0, 161 s). Output kept in `.scratch/tests/2026-11-06__configure-release-behavior-per-project/evidence/npm-test.out`. An earlier full run before the final one-line path-separator edit in `undoCut` was also 140/140. `node tests/check-skill-size.js --max 200` passes (SKILL.md 78 lines); `references/release.md` is 18 lines.

New cases: `tests/release.test.js` (unapproved refusal for `--version` and `--publish` naming the commands, usage errors for `--approve-post-bump` alone or with `--push`, approval recorded and config in the release commit with a clean tree, in-order execution, tracked change joins the commit, untracked file warns and stays out, approved list runs without the flag and writes no config, changed/reordered/shortened list refuses, failure restores changelog, version files, config, tracked changes and commits and tags nothing, rerun works, untracked leftovers reported); `tests/lib/project-config.test.js` (validation, exact-list comparison, `approvePostBump`); `tests/config.test.js` (`release.postBump` line).

## Review Notes

**Parent recovery record.** Base 758f9bd46f89bfeb39cd0336cb67876cd19bbbf8. Recovery pass 1: a host restart cancelled the implementer with uncommitted ticket edits in the tree and this log unfilled. The same child is resumed to finish and verify; the partial work is kept.

Implementer review against the criteria (base 758f9bd46f89bfeb39cd0336cb67876cd19bbbf8; nothing here changes the parent record above):

- Validated, ordered run after version files and before the commit: `release.postBump` validated in `lib/project-config.js` (list of non-empty strings); `release.js` runs each command via `cmd /d /s /c` or `/bin/sh -c` from the project root with output captured; fragments are deleted only after the commands succeed.
- Changed files join the commit: `git diff --name-only HEAD` (new `changedTrackedFiles` in `lib/git.js`) minus the planned files; untracked files (`untrackedFiles`) produce a warning and stay out.
- Approval: unapproved or changed list refuses before any write, naming the commands. `--approve-post-bump` (with `--version` or `--publish`) saves `release.postBumpApproved` and the config joins the release commit, leaving a clean tree. Suggest mode shows the commands and the flag in its `Next:` line.
- `--publish` refuses an unapproved list unless `--approve-post-bump` is passed (the flag passes through to the cut).
- Failure: `undoCut` (new `discardTrackedChanges` in `lib/git.js`, plus content saved before the first write for the changelog and config, which may be untracked or ignored) restores everything; nothing committed or tagged; the message carries the command and its output; a rerun works. Untracked files a command created are reported, not deleted.
- Docs: `references/release.md` (18 lines) shows the commands in the one question and passes the flag; `docs/WORK-DIR.md`, README config table and `docs/decisions/0017-release-post-bump-commands.md` added. `docs/COMPATIBILITY.md` untouched: no host behavior changes.

Changes after review: a tracked file restored by git is no longer overwritten from the saved snapshot (core.autocrlf rewrote it with LF and left it showing as modified); the test helper reads files line-ending agnostic. Added beyond the file list: `scripts/config.js` and `tests/config.test.js` (a read-only `release.postBump` line in `/gps config`), which are small and not required by the criteria.

Remaining gaps: the approval is a record in a committed file, not a security boundary (stated in decision 0017). A command that changes a git-ignored file other than the changelog and config is not restored on failure. Not tested live on a POSIX shell; the Windows `cmd` path is the one exercised.

**Parent review record.** Fresh independent reviewer, base 758f9bd46f89bfeb39cd0336cb67876cd19bbbf8, stable uncommitted diff. Findings and dispositions, none fixed:
- P2 release.js runShell: execFileSync uses the default 1 MB maxBuffer, so a command printing more dies with ENOBUFS (reviewer reproduced it with 2 MB), the cut is undone, and every rerun fails the same way. Actionable: set a large maxBuffer or stream output, and test a command printing over 1 MB.
- P3 release.js failure path: untracked files a failed command created stay, so the rerun refuses on a dirty tree, and the hint does not say to remove them. Actionable.
- P3 lib/git.js changedTrackedFiles: returns [] on a git error, which would silently drop post-bump changes from the release commit. Actionable: throw or warn.
- P3 test gap: no successful --publish --approve-post-bump end-to-end test.
Verification gap: the POSIX /bin/sh path has not been run; only Windows cmd was exercised. Implementer evidence: npm test 140/140 on this diff; not re-run by the parent.
Not accepted: unresolved actionable findings, and the single recovery pass was already used by the restart recovery above. Blocked for the user to decide on a further correction pass.

**Correction pass 2 (user-authorized, 2026-11-06).** The user chose an inline fix by the parent of the P2 and all three P3s, followed by one fresh independent review. If that review finds actionable problems, one further fix and re-review is allowed; a second such review with actionable problems blocks the ticket and stops the run before any push. The same review also covers the uncommitted follow-up fixes (preview warning in `release.js`, workspace members outside the project in `lib/version-files.js`, ubuntu in the CI matrix), which land as their own commits after this ticket. Base unchanged: 758f9bd46f89bfeb39cd0336cb67876cd19bbbf8.

Changes in the pass: `maxBuffer: Infinity` in `runShell`; `abortCut` undoes a cut and tells the user to remove or commit untracked leftovers; `changedTrackedFiles` returns `{ ok, files }` or `{ ok: false, reason }` and a git error stops the cut; new tests for 2 MB output on success and failure, a broken index, leftovers and a successful `--publish --approve-post-bump` against a bare origin. `tests/lib/git.test.js` joins the ticket's files.

**Re-review record.** Fresh independent reviewer, base 758f9bd46f89bfeb39cd0336cb67876cd19bbbf8, stable uncommitted diff including the follow-ups. Result: no actionable findings; all four earlier findings confirmed fixed by reading code and tests. Dispositions: a stale comment above `deleteFragments` ("deleted now") was noted as not a defect and left so the reviewed diff stays stable. Evidence gap (reviewer saw only the 11:43 test output): closed, `npm test` ran after the last edit, 140/140, output in `.scratch/tests/2026-11-06__configure-release-behavior-per-project/03-npm-test-pass2.out`; `check-skill-size` passes. POSIX gap: still open; the ubuntu job added to CI gives the first evidence once the PR is open, and the user chose to watch it.

**Acceptance.** Acceptance Criteria met per the reviewer's check and the parent's inspection, credible verification on Windows, no unresolved actionable findings. Accepted by the parent on the user's instructions, with the POSIX path disclosed as not yet run.

## Blockers / Challenges

- A host restart cancelled the first run; the work resumed from the uncommitted tree without a reset.
- On Windows with `core.autocrlf=true`, restoring the config from a saved snapshot after a git checkout left it showing as modified; fixed by restoring tracked files from git only. Tests compare file contents with line endings normalized.
- Shell quoting on Windows: commands run through `cmd /d /s /c "<command>"` with `windowsVerbatimArguments`, so the tests use `node step.js <arg>` style commands that quote identically under `sh`.

**Blocked (2026-11-06T10:45:57.354Z):** Review found unresolved actionable issues (P2: post-bump output over 1 MB fails with ENOBUFS; three P3s); the one recovery pass was used by the host-restart recovery, so another pass needs the user's go-ahead.

## Commits

- 09aa7d3 feat: run approved post-bump commands in a release (ticket 03)

## Time Spent

45m (ticket-start.js to ticket-complete.js)
