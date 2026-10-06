# Design: per-session changelog fragments

**Date:** 2026-10-06 · **Status:** approved design, awaiting spec review · **Amends:** `2026-10-05-changelog-and-release-design.md` (PR #35, not merged yet)

## Problem

PR #35 writes each session's bullets and bump marker under `## Unreleased` in CHANGELOG.md at `/gps finish`. That avoids version-number collisions, but every session inserts at the same spot, so two open session PRs always conflict textually on CHANGELOG.md. A careless resolution can drop a `gps:bump` line and silently lower the next suggested bump.

`merge=union` in `.gitattributes` does not fix it: GitHub's merge button and mergeability check use built-in strategies only and ignore merge attributes, and the GitHub PR is gps's main path.

## Goal

Two open session PRs never conflict over the changelog, on GitHub or locally. The user's experience of `/gps finish` and `/gps release` stays the same.

Decisions (brainstorm, 2026-10-06):
- Zero conflicts over showing CHANGELOG.md in the PR: CHANGELOG.md is rewritten only by `/gps release`.
- Fragments live in `.work/changelog/` (gps-owned, decision 0002).
- Rework PR #35 before merging, so no released gps version ever writes markers into CHANGELOG.md and no backward-compat code is needed.

## Fragment file

`.work/changelog/<session-id>.md`, one per session:

```
---
bump: minor
floor: patch
reason: removes the --legacy flag
---
- **Lead.** detail
  - nested detail
```

- Front matter: `key: value` lines between `---` fences. `bump` and `floor` ∈ `patch | minor | major` (required); `reason` (optional, single line).
- Body: the validated payload exactly as `parsePayload` accepts it for the CHANGELOG's format: plain bullets, or `### <Keep-a-Changelog section>` headings with bullets in `sections` format. Indented continuation lines allowed.
- No markers anywhere.

## `/gps finish` side

- `changelog-prepare.js`: unchanged output fields. `rerun` = this session's fragment exists. `unreleased` = the CHANGELOG's current `## Unreleased` body (hand-written bullets only). New warning when `.work/` is git-ignored: `.work/ is git-ignored: the changelog fragment stays on this machine; other clones won't see it until it is committed.`
- `changelog-apply.js --bump <level> [--reason "…"] [--file <path>]`: same validation (level, floor, reason when raised, payload format, disabled changelog). Writes/overwrites the session's fragment (`writeFileAtomic`-style temp + rename), records `config.changelog = { bump, floor, reason, bullets, path: <fragment rel path>, written_at }` and the `changelog_written` event, deletes the default payload. **No commit**: `.work/changelog` joins `GPS_WORK_PATHS` (lib/git.js) and `docs/WORK-DIR.md`, so finish's existing `chore(gps): finish …` record commit carries the fragment into the PR. Text: `📝 Changelog fragment: <bump> (<n> bullet(s)) → .work/changelog/<id>.md` + `Next: finish.js`.
- `finish.js`: output line becomes `📝 Changelog: <bump> (<n> bullet(s))`; INDEX.md `## Changelog` section unchanged plus a link to the fragment.
- CHANGELOG.md is never touched by finish.

## `/gps release` side

- **Suggest** (read-only): pending = all valid fragments in `.work/changelog/` + hand-written bullets under `## Unreleased`. Level = highest fragment `bump`; no fragments but hand bullets → `patch` + warning. Raised reasons from fragment `reason`. Candidates as before, **deduplicated** (on 0.x, major == minor is listed once).
- **Invalid fragment** (bad front matter, unknown level, unparsable body): suggest and `--version` refuse, naming the file and the problem.
- **`--version X.Y.Z`** (all existing refusals kept; "nothing to release" = no fragments and no hand bullets):
  1. Build the release section: hand-written Unreleased bullets first, then fragments ordered by filename (the session id starts with its date, `YYYY-MM-DD__`, so this is chronological by session start). In `sections` format, bullets merge into matching `###` subsections in Keep-a-Changelog order.
  2. Rename `## Unreleased` to `## X.Y.Z (date)`, or insert the new section above the first version heading (or after the title) when there is no Unreleased.
  3. Bump version files; delete the fragment files.
  4. One commit `chore(release): X.Y.Z` (body `Bump: <level of chosen version>`) holding CHANGELOG + version files + fragment deletions (+ `.work/gps-config.json` on the first release, unless ignored). Ignored `.work/`: fragments deleted from disk, nothing staged for them. Tag `vX.Y.Z`; tag resume unchanged.
- **`--push`**: unchanged.

## Code changes

- New `lib/changelog-fragments.js`: `FRAGMENTS_DIR = '.work/changelog'`, `fragmentPath(projectRoot, sessionId)`, `serializeFragment({ bump, floor, reason, body })`, `parseFragment(text) -> { bump, floor, reason, body }` (throws GpsError with the problem), `listFragments(projectRoot) -> [{ sessionId, file, bump, floor, reason, entry }]` (sorted; invalid → GpsError naming the file), `deleteFragments(projectRoot, files)`.
- `lib/changelog.js`: remove `upsertSessionEntry`, `readBumpMarkers`, `unknownBumpLevels`, marker suffix/bump-line handling. Keep `detectFormat`, `parsePayload`, `readUnreleased` (no `sessions` field), `unreleasedHasEntries`, `latestVersion`, `sectionNotes`. Replace `cutRelease` with `renderRelease(text, version, date, entries)` where `entries` are parsed payload results in order.
- `changelog-apply.js`, `changelog-prepare.js`, `release.js`, `finish.js`, `lib/changelog-session.js` updated; `lib/git.js` `GPS_WORK_PATHS` += `.work/changelog`.
- `references/finish.md`, `references/release.md`: wording only if needed (≤ 40 lines).

## Docs

- `docs/decisions/0003-changelog-unreleased-then-release.md` rewritten (still 0003, PR not merged): fragments in `.work/changelog/`, version set only at release; why not direct Unreleased edits (textual conflicts) and why not `merge=union` (GitHub ignores merge attributes).
- `docs/WORK-DIR.md`: `.work/changelog/` listed as gps-owned.
- README "Changelog and releases", PRIVACY.md, gps's own CHANGELOG `## Unreleased` bullets: describe fragments; drop the "parallel sessions conflict, keep both sides" wording.
- The 2026-10-05 spec gets a one-line note at the top pointing to this amendment.

## Testing

- `tests/lib/changelog-fragments.test.js`: round-trip serialize/parse (plain, sections, nested, CRLF input), missing/unknown bump → error, list ordering, invalid file named in error.
- `tests/lib/changelog.test.js`: remove marker tests; `renderRelease` cases: hand bullets + 2 fragments (order), sections merge, no Unreleased (insert above version heading / after title), bracketed `[Unreleased]`, CRLF.
- `tests/changelog-apply.test.js`: fragment written, CHANGELOG.md untouched, re-run overwrites (one file), refusals unchanged, ignored `.work/` warning (prepare).
- `tests/release.test.js`: suggest from fragments; cut deletes fragments in the release commit; ignored `.work/`; invalid fragment refused; 0.x dedup.
- **Conflict regression** (the reason for this change): two session branches from the same main each finish with a fragment; merging both into main produces no conflict (`git merge` exit 0); release then contains both sessions' bullets.
- `tests/e2e.test.js`, `tests/github-flow.test.js`, `tests/skill.test.js` (WORK-DIR names `.work/changelog`) updated.
