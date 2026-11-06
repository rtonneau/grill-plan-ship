# 0017: release.postBump runs project commands, approved as an exact list

_Recorded 2026-11-06._

## Context

Bumping a version often leaves other files stale: a `Cargo.lock`, `package-lock.json` or generated manifest that records the version. The release commit then ships out of sync, or the user fixes it by hand after the tag. gps should let a project name the commands that bring those files up to date, inside the release transaction.

The commands are shell strings read from `.work/gps-config.json`, a committed file. A pull request that edits it would otherwise get its commands run by whoever releases next, with that person's credentials.

## Decision

- `release.postBump` is a list of command strings. `release.js --version` runs them in order, through the platform shell, from the project root, after the version files are written and before the release commit. Output is captured so stdout stays the script's own.
- **Consent is per exact list.** The cut runs the commands only when the list equals `release.postBumpApproved` (same commands, same order). Otherwise it refuses before writing anything and names the commands; a changed list is a new list. `--approve-post-bump` (with `--version` or `--publish`) records the list in `release.postBumpApproved` as part of the cut, and the config joins the release commit, so the tree is clean for the next release. `/gps release` shows the commands and asks once, before the cut. `--publish` preapproves the version and the push, not the commands: it needs `--approve-post-bump` too.
- **What joins the commit:** the tracked files the commands changed (`git diff --name-only` against HEAD; the tree was clean at the start). Untracked files they create produce a warning and stay out, so the commit holds no file nobody reviewed.
- **A failing command undoes the cut.** Tracked files go back from HEAD; the changelog and config, which may be untracked or ignored, go back from their content saved before the first write (or are deleted when new). Fragments are only deleted after the commands succeed, so they are untouched. Nothing is committed or tagged, the message gives the command and its output, and a rerun works. An approval recorded by the failed run is undone with it. Untracked files the commands created are reported, not deleted.

## Alternatives rejected

- **Approving once per project, not per list:** a later edit of the list would run unseen. The exact-list rule makes any change visible again.
- **A trust prompt in the script:** scripts never ask; the agent asks and the flag records the answer.
- **Committing every file the commands touched, untracked ones included:** a command that writes build output would put it in a release. A warning keeps that a deliberate choice.
- **Running the commands after the commit and amending:** a failure would leave a release commit with the wrong content.

## Consequences

- The approval is a record in a committed file, not a security boundary: whoever can edit the config can also edit `postBumpApproved`. It stops a changed list from running unseen on the releaser's machine; review of the config in pull requests remains the control.
- Commands need their tools on the releasing machine; a missing tool is a failing command, and the cut is undone.
- A command that changes a git-ignored file other than the changelog and config leaves that change in place on failure.
