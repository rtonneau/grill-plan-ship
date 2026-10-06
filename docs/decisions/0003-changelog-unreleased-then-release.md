# 0003: sessions write a changelog fragment, /gps release sets the version

_Recorded 2026-10-05, reworked 2026-10-06._

## Context

Every finished session is a pull request. If each one also picked the next version number, bumped `package.json` and renamed a changelog heading, two sessions open at the same time would both claim the same version and conflict on the same lines of the same files. A first design (entries under `## Unreleased`, with a marker line per session) removed the version collision but not the textual one: every session inserted its block at the same spot, right under `## Unreleased`, so the second pull request to merge always conflicted. These conflicts aren't real disagreements, so resolving them by hand is wasted work, and a wrong merge can ship a duplicated or skipped version.

## Decision

`/gps finish` writes the session's entry to its own file, `.work/changelog/<session-id>.md`: front matter (`bump`, `floor` and, when the bump is above the floor, `reason`) and a body of bullets. It never edits `CHANGELOG.md`, never touches a version number and makes no commit of its own: the `chore(gps): finish …` record commit carries the fragment. The version is set only by `/gps release`: it reads every fragment (and any hand-written `## Unreleased` bullets), suggests the highest bump, asks the user, then renders the bullets into `## X.Y.Z (date)`, bumps the version files, and commits the CHANGELOG, the version files and the fragment deletions in one `chore(release)` commit before tagging. Fragments are deleted only after that commit succeeds, and an invalid fragment is refused by name.

A session's bump can't go below the floor implied by its commit types, so a `feat` is never recorded as a patch. Going higher needs a reason, which INDEX.md keeps.

## Alternatives rejected

- **Editing `## Unreleased` directly:** every parallel pull request inserts at the same spot, so each one after the first conflicts.
- **A `merge=union` attribute on the CHANGELOG:** the attribute lives in `.gitattributes` and only applies to merges git performs locally. GitHub's merge button is reported to ignore merge attributes (community-reported, for example [keep-a-changelog issue 56](https://github.com/olivierlacan/keep-a-changelog/issues/56)), so the conflict would come back on the pull requests this plugin produces.

## Consequences

- `CHANGELOG.md` changes only at release. Two sessions never write the same file, so there is nothing to merge.
- A pull request shows its own changelog entry as a small new file, which a reviewer can read and correct.
- The version is chosen once, by the person releasing, with every merged entry in view.
- A release costs one manual confirmation (and a second one to push), by design: `/gps release` never runs under `/gps auto`.
- If `.work/` is git-ignored, the fragment stays on that machine and never reaches a release made elsewhere. `changelog-prepare.js` warns.
- A project that doesn't want this sets `changelog.enabled` to `false`, and gps writes no fragment.
