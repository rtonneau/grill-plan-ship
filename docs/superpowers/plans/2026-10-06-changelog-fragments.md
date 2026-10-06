# Per-Session Changelog Fragments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/gps finish` writes each session's changelog entry to `.work/changelog/<session-id>.md` instead of editing CHANGELOG.md, and `/gps release` merges those fragments into the release section, so parallel session PRs never conflict.

**Architecture:** A new `lib/changelog-fragments.js` owns the fragment file format and directory. `lib/changelog.js` keeps CHANGELOG text parsing and gains `renderRelease`, losing all marker code. `changelog-apply.js` writes a fragment (no commit; `.work/changelog` joins `GPS_WORK_PATHS`), and `release.js` reads fragments, renders, deletes them in the release commit.

**Tech Stack:** Node.js built-ins only; plain `node` + `assert` tests via `tests/helpers.js` (`npm test`).

**Spec:** `docs/superpowers/specs/2026-10-06-changelog-fragments-design.md` (amends `docs/superpowers/specs/2026-10-05-changelog-and-release-design.md`)

## Global Constraints

- Node.js built-ins only. Script contract from `.claude/CLAUDE.md`: `main({usage, options, run})`, `run` returns `{text, data}`, `UsageError` exit 2, `GpsError(message, hint)` exit 1, `warn()` for warnings; git only in `lib/git.js`, gh only in `lib/github.js`; refuse (changing nothing) or resume.
- Fragment path: `.work/changelog/<session-id>.md`; constant `FRAGMENTS_DIR = '.work/changelog'`.
- Fragment format: `---` fenced front matter of `key: value` lines; `bump`, `floor` ∈ `patch | minor | major` (required); `reason` optional single line; body = payload as accepted by `parsePayload` for the CHANGELOG's format. No markers anywhere.
- CHANGELOG.md is never written by `/gps finish`; only `release.js --version` writes it.
- Release section order: hand-written `## Unreleased` bullets first, then fragments sorted by filename.
- Release commit: `chore(release): X.Y.Z` + body `Bump: <level of chosen version>`, holding CHANGELOG + version files + fragment deletions (+ `.work/gps-config.json` on first release unless ignored).
- `changelog-prepare` ignored-`.work/` warning, verbatim: `.work/ is git-ignored: the changelog fragment stays on this machine; other clones won't see it until it is committed.`
- `changelog-apply` text: `📝 Changelog fragment: <bump> (<n> bullet(s)) → .work/changelog/<id>.md` then `Next: finish.js`. `finish.js` line: `📝 Changelog: <bump> (<n> bullet(s))`.
- Candidates line deduplicated: a version is listed once even when two levels produce it.
- `references/*.md` ≤ 40 lines; each new lib gets `tests/lib/<lib>.test.js`; `npm test` green after every task.

## Review Focus

1. **Format changed between finish and release** (fragment written for a plain CHANGELOG, file now uses `###` sections, or the reverse): a plain fragment goes under `### Changed`; a sections fragment into a plain file is flattened to its bullets in SECTIONS order. Test in Task 2.
2. **Non-fragment files in `.work/changelog/`** (`.gitkeep`, `notes.txt`, an editor backup `x.md~`): only `*.md` files are fragments; others are ignored silently. Test in Task 1.
3. **CRLF fragment** (edited on Windows): parses identically to LF. Test in Task 1.
4. **No CHANGELOG.md yet when releasing** with fragments: the file is created with `NEW_FILE_HEADER` and the release section. Test in Task 2.
5. **Two sessions finish on parallel branches**: merging both into main has no conflict, and the release contains both entries. Test in Task 3 (merge) and Task 4 (release).

---

### Task 1: `lib/changelog-fragments.js`

**Files:**
- Create: `skills/gps/scripts/lib/changelog-fragments.js`
- Test: `tests/lib/changelog-fragments.test.js`

**Interfaces:**
- Consumes: `LEVELS` (`lib/semver.js`), `GpsError` (`lib/guard.js`).
- Produces:
  - `FRAGMENTS_DIR = '.work/changelog'`
  - `fragmentPath(projectRoot, sessionId) -> string` (absolute)
  - `serializeFragment({ bump, floor, reason, body }) -> string` (LF; `reason` line omitted when empty; body ends with one newline)
  - `parseFragment(text) -> { bump, floor, reason: string | null, body: string }` — throws `GpsError` naming the problem (`missing front matter`, `bump "huge" is not patch, minor or major`, `missing floor`, `empty body`).
  - `listFragments(projectRoot) -> [{ sessionId, file, bump, floor, reason, body }]` — `*.md` only, sorted by filename, `file` relative to projectRoot with `/`; `[]` when the dir is missing; an invalid fragment throws `GpsError` whose message starts with the relative file path.
  - `writeFragment(projectRoot, sessionId, fragment) -> string` (relative path; creates the dir; temp file + rename).
  - `deleteFragments(projectRoot, files) -> void` (missing files ignored).

- [ ] **Step 1: Failing tests** — round-trip `parseFragment(serializeFragment(f))` deep-equals `f` for: plain body, nested body (`- a\n  - b`), sections body (`### Added\n- x`), with and without reason; CRLF text parses the same as LF; each listed error message; `listFragments` on a dir holding `2026-10-06__b.md`, `2026-10-05__a.md`, `.gitkeep`, `notes.txt`, `x.md~` returns only the two `.md` in order `a`, `b`; an invalid `.md` → error message starting `.work/changelog/2026-10-05__bad.md`; `writeFragment` overwrite leaves one file; `deleteFragments` with a missing path does not throw.
- [ ] **Step 2:** `node tests/lib/changelog-fragments.test.js` → FAIL (module not found).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** test passes; `npm test` green.
- [ ] **Step 5:** Commit `feat(changelog): per-session fragment files`.

### Task 2: `renderRelease` in `lib/changelog.js`

**Files:**
- Modify: `skills/gps/scripts/lib/changelog.js`
- Test: `tests/lib/changelog.test.js`

**Interfaces:**
- Consumes: `parsePayload`, `detectFormat`, `SECTIONS`, `NEW_FILE_HEADER`, `UNRELEASED_RE`, `VERSION_HEADING_RE` (existing in this file).
- Produces: `renderRelease(text: string | null, version: string, date: string, bodies: string[]) -> string` — `bodies` are fragment bodies in order. Steps: take hand bullets under Unreleased (if any); parse each body with `parsePayload(body, bodyFormat)` where `bodyFormat` is `sections` if the body has a `### ` line else `plain`; merge into the file's format (Review Focus 1); write `## <version> (<date>)` in place of the Unreleased heading, else above the first version heading, else after the title (new file → `NEW_FILE_HEADER` first). Preserve CRLF. Existing marker functions stay untouched in this task (removed in Task 4).

- [ ] **Step 1: Failing tests:** hand bullet `- hand` + bodies `['- a', '- b']` on a plain file → section lists `- hand`, `- a`, `- b` in that order under `## 1.1.0 (2026-10-06)`, no `## Unreleased` left; sections file + body `### Fixed\n- y` → `- y` under `### Fixed`; plain body into sections file → under `### Changed`; sections body into plain file → bullets flattened in SECTIONS order; no Unreleased → section inserted above `## [1.0.0] - 2026-01-01`; `null` text → starts with `NEW_FILE_HEADER`; `## [Unreleased]` heading replaced; CRLF input → no lone `\n`; older sections byte-identical.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS; `npm test` green.
- [ ] **Step 5:** Commit `feat(changelog): render a release from hand bullets and fragments`.

### Task 3: finish side writes fragments

**Files:**
- Modify: `skills/gps/scripts/changelog-apply.js`, `skills/gps/scripts/changelog-prepare.js`, `skills/gps/scripts/finish.js`, `skills/gps/scripts/lib/git.js` (`GPS_WORK_PATHS`), `docs/WORK-DIR.md`, `skills/gps/references/finish.md` (only if wording mentions CHANGELOG.md edits)
- Test: `tests/changelog-apply.test.js`, `tests/changelog-prepare.test.js`, `tests/finish.test.js`, `tests/e2e.test.js`

**Interfaces:**
- Consumes: Task 1 (`writeFragment`, `fragmentPath`, `FRAGMENTS_DIR`), existing `detectFormat`, `parsePayload`, `checkChangelogable`, `sessionCommits`, `isIgnored`.
- Produces: `config.changelog = { bump, floor, reason, bullets, path: '.work/changelog/<id>.md', written_at }`; `GPS_WORK_PATHS` includes `'.work/changelog'`.
- Behaviour: apply validates exactly as today, then `writeFragment` (body = payload text as given), records config + `changelog_written`, deletes the default payload; no `commitFiles`, CHANGELOG.md untouched. prepare: `rerun` = fragment exists; warn (verbatim constraint) when `isIgnored(projectRoot, '.work/')`. finish: output line per Global Constraints; INDEX `## Changelog` adds `- **Fragment:** [<file>](<relative link from session dir>)`.

- [ ] **Step 1: Failing tests:**
  - apply writes `.work/changelog/<id>.md` whose `parseFragment` gives the chosen bump and reason; `CHANGELOG.md` absent afterwards; no `docs(changelog)` commit in `git log`; re-run with another payload → one fragment file, new body; refusals unchanged (below floor, raised without reason, invalid payload, disabled) and leave no fragment.
  - prepare with `.work/` in `.gitignore` → stderr contains the verbatim warning.
  - finish: the fragment is in finish's `chore(gps): finish` commit (`git show --name-only HEAD` lists it); output has `📝 Changelog: minor (1 bullet(s))`.
  - Review Focus 5 (merge half), in `tests/changelog-apply.test.js`: from one main, branch A and branch B each run a session to finish (non-GitHub: create the branches with `git switch -c`, finish on each), then `git switch main && git merge --no-edit A && git merge --no-edit B` both exit 0 and `.work/changelog/` holds both fragments.
- [ ] **Step 2:** FAIL. **Step 3:** implement; update `docs/WORK-DIR.md` to list `.work/changelog/` as gps-owned (tests/skill.test.js checks every `GPS_WORK_PATHS` entry is named there). **Step 4:** `npm test` green — `release.js` still reads markers at this point, so update `tests/release.test.js`/`tests/github-flow.test.js` fixtures only if they break, by writing Unreleased bullets by hand.
- [ ] **Step 5:** Commit `feat(gps): finish writes a changelog fragment instead of editing CHANGELOG.md`.

### Task 4: release reads fragments; remove markers

**Files:**
- Modify: `skills/gps/scripts/release.js`, `skills/gps/scripts/lib/changelog.js` (remove `upsertSessionEntry`, `readBumpMarkers`, `unknownBumpLevels`, `cutRelease`, marker regexes; `readUnreleased` drops `sessions`), `skills/gps/references/release.md` (only if wording changes)
- Test: `tests/release.test.js`, `tests/github-flow.test.js`, `tests/e2e.test.js`, `tests/lib/changelog.test.js`

**Interfaces:**
- Consumes: Task 1 (`listFragments`, `deleteFragments`), Task 2 (`renderRelease`), existing semver/version-files/git helpers.
- Behaviour:
  - pending = `listFragments` + hand bullets (`unreleasedHasEntries`). Level = `maxLevel(fragments.map(f => f.bump))`; no fragments but hand bullets → `patch` + existing warning. Raised lines from fragments where `levelRank(bump) > levelRank(floor)`: `<sessionId>: <reason>`. An invalid fragment → refuse (the `GpsError` from `listFragments`).
  - Candidates: `{patch, minor, major}` in `data.alternatives` unchanged; the text line lists each distinct version once, labelled with all levels that give it (e.g. `minor/major 0.5.0`).
  - `--version`: `renderRelease(text, v, localDate(), fragments.map(f => f.body))`; write; bump version files; `deleteFragments`; commit files = CHANGELOG + version files + deleted fragment paths (only when `.work/` is not ignored and the path is tracked) + config as today. "Nothing to release" when no fragments and no hand bullets.
  - Remove `finishedSessions`-based raised-reason lookup (base-branch fallback keeps using finished sessions).

- [ ] **Step 1: Failing tests:**
  - suggest: two finished sessions (fragments `minor` and `patch`, one raised with reason) → `1.4.2 → 1.5.0 (minor: 2 session(s))`, raised line names the session and reason; HEAD unchanged, tree clean.
  - `--version 1.5.0`: CHANGELOG section has both sessions' bullets (filename order) after any hand bullet; `.work/changelog/` empty; `git show --name-only HEAD` lists CHANGELOG.md, package.json and both deleted fragments; no `<!--` anywhere in CHANGELOG.md.
  - Review Focus 5 (release half): after the Task 3 parallel-branch merge scenario, release contains both entries.
  - invalid fragment (`bump: huge`) → exit 1 naming the file; tree unchanged.
  - 0.x: `0.4.2` with a `minor` fragment → candidates text lists `0.5.0` once.
  - ignored `.work/`: fragments deleted from disk, release commit has no `.work/` path.
  - `tests/lib/changelog.test.js`: marker tests removed; `readUnreleased` result has no `sessions`.
- [ ] **Step 2:** FAIL. **Step 3:** implement; delete the dead marker code. **Step 4:** `npm test` green; `grep -rn "gps:bump\|gps:<" skills/` finds nothing.
- [ ] **Step 5:** Commit `feat(gps): release merges changelog fragments; drop Unreleased markers`.

### Task 5: Docs

**Files:**
- Modify: `docs/decisions/0003-changelog-unreleased-then-release.md`, `README.md` ("Changelog and releases" + privacy bullets), `PRIVACY.md`, `CHANGELOG.md` (gps's own `## Unreleased` bullets), `docs/superpowers/specs/2026-10-05-changelog-and-release-design.md` (one-line note at top: `**Amended by:** 2026-10-06-changelog-fragments-design.md — entries are per-session fragments, not Unreleased edits.`), `.claude/CLAUDE.md` (Session files paragraph: mention `.work/changelog/`)

- [ ] **Step 1:** Rewrite 0003 (keep number and filename): context (version-number collisions and textual conflicts under Unreleased), decision (fragments in `.work/changelog/`, version set only by `/gps release`), alternatives rejected (direct Unreleased edits: conflict on every parallel PR; `merge=union`: GitHub's merge button ignores merge attributes), consequences (CHANGELOG.md only changes at release; a PR shows the fragment).
- [ ] **Step 2:** README/PRIVACY: finish writes `.work/changelog/<session-id>.md` (committed with the session record); release rewrites CHANGELOG.md, deletes fragments; remove every "parallel sessions conflict / keep both sides" sentence and every mention of markers in CHANGELOG.md.
- [ ] **Step 3:** `npm test` and `node tests/check-skill-size.js --max 200` green; `grep -rn "keep both sides\|gps:bump" README.md PRIVACY.md CHANGELOG.md docs/decisions` finds nothing.
- [ ] **Step 4:** Commit `docs(gps): changelog fragments in decision 0003, README and PRIVACY`.
