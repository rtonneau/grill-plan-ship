# Design: automatic CHANGELOG.md and `/gps release`

**Date:** 2026-10-05 · **Status:** approved design, awaiting spec review

## Goal

gps maintains the target repo's `CHANGELOG.md` with as little manual work as possible, and suggests the semver bump (major / minor / patch) for the next release.

- Every finished session adds user-facing bullets to `CHANGELOG.md`, inside the session's PR, with no question asked.
- A new `/gps release` turns the accumulated entries into a version: it suggests the number, and on confirmation bumps version files, commits, tags and (optionally) pushes and publishes a GitHub Release.
- The only human actions: confirm the version at release time, and confirm the push.

Non-goals: per-ticket changelog entries; releasing from `/gps auto`; editing past version sections; non-semver schemes.

## Decisions (from the brainstorm)

| Topic | Decision |
|---|---|
| When entries are written | At `/gps finish`, one entry per session, before the PR push |
| Where | Under `## Unreleased` (Keep-a-Changelog convention), created if missing; the version heading is written only by `/gps release`. Reason: parallel session PRs would otherwise collide on the same version number |
| Bump level | Script computes a floor from the session's conventional commits; Claude may raise it (with a reason), never lower it |
| Opt-in | On by default; `changelog.enabled: false` in `.work/gps-config.json` opts out. A repo with no `CHANGELOG.md` gets one on first finish |
| Format | Match the existing file: if it uses Keep-a-Changelog subsections (`### Added` / `Changed` / `Deprecated` / `Removed` / `Fixed` / `Security`), file bullets under them; otherwise plain bullets (`- **Lead.** detail`). New files use plain bullets |
| Version files | Detected once into `release.versionFiles` in `gps-config.json`, editable by hand |
| Tags | Every release is tagged `vX.Y.Z`, patches included |
| GitHub Release | `release.githubRelease: "none" \| "minor+" \| "all"`, default `"minor+"` (GitHub projects only) |
| Push | Asked every time; never automatic |

## Part 1 — changelog at `/gps finish`

### Scripts (approach A: prepare / apply pair, like `write-prepare` / `write-apply`)

**`changelog-prepare.js [--json]`** (read-only). For the current session it prints:
- whether the changelog is enabled (if not: one line, `Next:` is `finish.js`, nothing else);
- the session's commits (`commitsBetween(base, branch)` for a branch session, `readRecentCommits(since created_at)` otherwise), with gps's own `chore(gps)` and `docs(changelog)` commits excluded;
- the **bump floor**: `major` if any commit has `!` after its type/scope or a `BREAKING CHANGE:` footer; else `minor` if any `feat`; else `patch`;
- the file's **format** (`plain` or `sections`, or `new` when `CHANGELOG.md` is missing);
- the current `## Unreleased` content, and whether this session already has an entry (re-run).

**`changelog-apply.js --bump <major|minor|patch> [--reason "<why>"] --file <payload.md> [--json]`**
- Payload: Markdown bullets. With `sections` format, bullets are grouped under `### Added` etc. headings in the payload; with `plain`, bullets only. Validation: at least one bullet; heading names restricted to the six Keep-a-Changelog ones; a format mismatch with the file is a `UsageError`.
- Refuses (`GpsError`) when `--bump` is below the floor. `--reason` is required when `--bump` is above the floor.
- Writes under `## Unreleased` (inserted right above the first `## ` version heading, or after the file header; a new file gets a short header: title + "Versions follow semantic versioning"). In `sections` format the bullets are merged into the matching subsections (created if missing, in Keep-a-Changelog order); in `plain` format they are appended.
- Markers (HTML comments, invisible when rendered), the same in both formats:
  - each of the session's bullet lines ends with ` <!-- gps:<session-id> -->`;
  - one line `<!-- gps:bump=<level> session=<session-id> -->` at the end of the Unreleased block.
- **Idempotent:** on a re-run for the same session, every line carrying that session's markers is removed first, then the new bullets are written. Bullets without markers (written by hand) are never touched.
- Commits only `CHANGELOG.md` as `docs(changelog): <feature_name>` on the checked-out branch (session branch for GitHub sessions) via a new `commitPaths` helper in `lib/git.js` (or the existing path-scoped commit if one fits). Records `changelog_written` with `recordEvent`.
- Stored in `.session-config.json`: `changelog: { bump, reason, written_at }`; shown in INDEX.md.

### Reference changes

`references/finish.md` gains a step 0, before `finish.js`:
`changelog-prepare.js`; if enabled, draft user-facing bullets (from resume, plan, ticket titles, commits; what a user notices, not internal refactors) and choose the bump (≥ floor, with a reason if raised); write them to the scratch dir; `changelog-apply.js`. No question to the user ("running /gps finish is the go-ahead" still holds). If apply fails, stop and report; `finish.js` is not run.

`finish.js` itself is unchanged except: INDEX.md lists the changelog entry and bump; its output adds `📝 CHANGELOG.md: <bump> (<n> bullet(s))` when the session has a `changelog` record.

## Part 2 — `/gps release`

New command: `references/release.md`, `scripts/release.js`, `allowed-tools` line, `help.js` / SKILL.md command table entry, README section.

**`release.js [--json]`** (read-only, step 1):
- Refuses unless: on the base branch (default branch of origin, or the `base_branch` recorded by the most recent session), working tree clean, `## Unreleased` exists and has at least one bullet.
- Reads all `gps:bump` markers under Unreleased; level = highest (none found → `patch`, with a warning that entries were written by hand).
- Current version: from `release.versionFiles` (detected and stored on first run: `package.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` (`plugins[].version`), `pyproject.toml`, `Cargo.toml`, `CMakeLists.txt` `project(... VERSION x.y.z)`); falls back to the latest `## X.Y.Z` heading in CHANGELOG.md. Version files that disagree → warning listing each.
- 0.x rule: a `major` bump on `0.y.z` gives `0.(y+1).0`.
- Prints `2.5.1 → 2.6.0 (minor: 3 sessions, 1 raised by Claude: <reason>)` and `Next:` asking the user to confirm.

**`release.js --version X.Y.Z [--push] [--json]`** (step 2):
- Refuses if `vX.Y.Z` tag exists, or X.Y.Z is not greater than the current version.
- Renames `## Unreleased` to `## X.Y.Z (YYYY-MM-DD)`, strips all gps markers in that section, leaves no empty Unreleased behind.
- Writes the version into every `release.versionFiles` entry.
- Commits only CHANGELOG.md + version files: `chore(release): X.Y.Z`; creates annotated tag `vX.Y.Z`.
- Records the level in the commit body (`Bump: minor`) so step 3 can apply the GitHub Release policy without re-reading markers.
- `Next:` asks the user whether to push (step 3).

**`release.js --push [--json]`** (step 3):
- Refuses unless HEAD is a `chore(release): X.Y.Z` commit tagged `vX.Y.Z`.
- `git push --follow-tags`; then, if GitHub is enabled and `githubRelease` matches the level (`minor+` = minor or major; `all`; `none`), `gh release create vX.Y.Z --notes-file <that CHANGELOG section>` via `lib/github.js`. Failures print the commands to run by hand, like `finish.js`. Re-running after a partial failure resumes (skips a push already done, an existing GitHub Release).

`references/release.md`: run `release.js`; ask "Release X.Y.Z?" with AskUserQuestion (suggested version first, "(Recommended)"; alternatives: the other bump levels; Other = custom); run `--version`; ask "Push and publish?"; on yes run `--push`, on no relay the commands.

## Config

`.work/gps-config.json` gains (all optional, defaults applied on read in `lib/project-config.js`; validation extended):

```json
{
  "changelog": { "enabled": true, "path": "CHANGELOG.md" },
  "release": { "versionFiles": ["package.json", ".claude-plugin/plugin.json"], "githubRelease": "minor+" }
}
```

`/gps config` shows these values; editing is by hand (no new flags).

## Error handling

- Every script refuses (changing nothing) or resumes; none overwrites work. `changelog-apply` re-run replaces only its own session's entry.
- A failed commit / push / gh call never loses the CHANGELOG edit: the output lists the commands to run by hand.
- `CHANGELOG.md` with no recognizable structure (no `#` title, odd headings): `changelog-prepare` reports `format: unknown` and `changelog-apply` inserts `## Unreleased` after the first line; a warning suggests checking the result.

## Testing

Per the repo rules: `tests/changelog-prepare.test.js`, `tests/changelog-apply.test.js`, `tests/release.test.js`, plus lib tests for any new lib (`lib/changelog.js`: parse/insert/marker logic; `lib/semver.js`: parse, bump, compare, 0.x rule). Cases: new file, plain file, sections file, re-run idempotency, bump below floor refused, raised bump without reason refused, disabled changelog, release with mixed markers, disagreeing version files, existing tag refused, `githubRelease` policy matrix with the stub `gh`. The e2e and github-flow tests cover finish → release end to end. `tests/skill.test.js` coverage comes for free (allowed-tools, sizes, one test per script).

## Docs

README (finish behaviour + new release command), CHANGELOG of gps itself, `docs/WORK-DIR.md` unchanged (no new `.work/` path; config keys live in the existing `gps-config.json`). A decision record `docs/decisions/0003-changelog-unreleased-then-release.md` captures why entries go under Unreleased and why the version is set only at release.
