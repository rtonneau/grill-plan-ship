# 0003: sessions write the changelog under Unreleased, /gps release sets the version

_Recorded 2026-10-05._

## Context

Every finished session is a pull request. If each one also picked the next version number, bumped `package.json` and renamed a changelog heading, two sessions open at the same time would both claim the same version and conflict on the same lines of the same files. These conflicts aren't real disagreements, so resolving them by hand is wasted work, and a wrong merge can ship a duplicated or skipped version.

## Decision

`/gps finish` writes the session's entry under `## Unreleased` in the CHANGELOG, with a marker line `<!-- gps:bump=<level> session=<id> -->` that records the session's bump (`patch`, `minor` or `major`). It never touches a version number. The version is set only by `/gps release`: it reads the markers, suggests the highest bump, asks the user, then renames Unreleased to `## X.Y.Z (date)`, removes the markers, bumps the version files, commits and tags.

A session's bump can't go below the floor implied by its commit types, so a `feat` is never recorded as a patch. Going higher needs a reason, which INDEX.md keeps.

## Consequences

- Concurrent sessions never collide on a version number: none of them picks one. They do still touch the same place in the file: each inserts its block right under `## Unreleased`, so when two such pull requests are open, the second one to merge gets a textual conflict there. It is expected and trivial: keep both sides, including both `<!-- gps:bump=... -->` lines (`/gps release` reads one per session). A design that avoids the conflict entirely (one fragment file per session, or a `merge=union` attribute on the CHANGELOG) is left as a follow-up.
- The version is chosen once, by the person releasing, with every merged entry in view.
- A release costs one manual confirmation (and a second one to push), by design: `/gps release` never runs under `/gps auto`.
- The markers are gps's own. `/gps release` removes them, so a released CHANGELOG is plain text.
- A project that doesn't want this sets `changelog.enabled` to `false`, and gps leaves its changelog alone.
