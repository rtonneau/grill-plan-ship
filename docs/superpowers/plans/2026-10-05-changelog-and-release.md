# Automatic CHANGELOG + `/gps release` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/gps finish` writes Claude-drafted bullets and a bump hint under `## Unreleased` in the target repo's CHANGELOG.md; a new `/gps release` turns them into a tagged, committed version.

**Architecture:** Two pure libs (`lib/semver.js`, `lib/changelog.js`) hold all parsing and text transforms; `lib/version-files.js` reads/writes version fields; git/gh calls are added to `lib/git.js` / `lib/github.js`. Three new scripts (`changelog-prepare.js`, `changelog-apply.js`, `release.js`) follow the `lib/cli.js` contract; references `finish.md` (new step) and `release.md` (new) call them in one line each.

**Tech Stack:** Node.js built-ins only; tests are plain `node` scripts using `assert` and `tests/helpers.js` (run with `npm test` or `node tests/<file>.test.js`).

**Spec:** `docs/superpowers/specs/2026-10-05-changelog-and-release-design.md`

## Global Constraints

- Node.js built-ins only. Scripts use `main({ usage, options, run })` from `lib/cli.js`; `run` returns `{ text, data }`; never print to stdout, never `process.exit`; `UsageError` exit 2, `GpsError(message, hint)` exit 1; warnings via `warn()`.
- Git calls only in `lib/git.js`, gh calls only in `lib/github.js`, via `execFileSync` with an argument array. gh honours `GPS_GH_BIN` (already, through `runGh`).
- JSON writes via `writeJsonAtomic`; each session state change recorded with `recordEvent` after files are written.
- Scripts refuse (changing nothing) or resume; they never overwrite work.
- Marker formats, verbatim: bullet suffix ` <!-- gps:<session-id> -->`; bump line `<!-- gps:bump=<level> session=<session-id> -->`.
- Commit messages, verbatim: `docs(changelog): <feature_name>`; `chore(release): X.Y.Z` with body line `Bump: <level>`. Tag: annotated `vX.Y.Z`.
- Release heading: `## X.Y.Z (YYYY-MM-DD)` (local date, `localDate()` from `lib/guard.js`).
- Config defaults: `changelog: { enabled: true, path: "CHANGELOG.md" }`, `release: { versionFiles: <detected>, githubRelease: "minor+" }`; `githubRelease` ∈ `none | minor+ | all`.
- Bump floor: `major` if any message has `!` before the `:` of its type/scope or a `BREAKING CHANGE:` / `BREAKING-CHANGE:` footer; else `minor` if any `feat`; else `patch`. 0.x: `major` on `0.y.z` → `0.(y+1).0`.
- Keep-a-Changelog subsection names, in order: `Added, Changed, Deprecated, Removed, Fixed, Security`.
- `references/*.md` ≤ 40 lines; SKILL.md < 100 lines; each new script gets its own `allowed-tools` line (alphabetical) and `tests/<script>.test.js`; each new lib gets `tests/lib/<lib>.test.js`.

## Review Focus

1. **Existing version-heading styles.** `## 2.5.1`, `## 2.5.1 (2026-10-05)`, `## [2.5.1] - 2026-10-05` and `## v2.5.1` must all be recognised as version headings (Unreleased goes above the first; "latest version" fallback reads them). Test in Task 2 and Task 3.
2. **gps dogfooding its own CHANGELOG.** `tests/skill.test.js:151` requires `^## X.Y.Z$`; after this feature, gps's own releases write `## X.Y.Z (date)`. Relax that regex to accept an optional ` (YYYY-MM-DD)` suffix (Task 9).
3. **CRLF files.** A CHANGELOG.md with `\r\n` line endings (Windows checkouts) must keep its line endings after apply and release. Test in Task 2.
4. **Hand-written bullets under Unreleased mixed with gps bullets.** Re-running apply for session A must not touch hand bullets or session B's bullets; release must keep them all and strip only markers. Test in Task 2 and Task 3.
5. **No version files and no prior version heading** (a brand-new repo). Release must refuse with a hint to pass `--version`, not crash or guess `0.0.0` silently; with `--version 0.1.0` it works. Test in Task 7.

---

### Task 1: `lib/semver.js`

**Files:**
- Create: `skills/gps/scripts/lib/semver.js`
- Test: `tests/lib/semver.test.js`

**Interfaces:**
- Produces: `LEVELS = ['patch', 'minor', 'major']`; `parseVersion(s: string) -> {major, minor, patch} | null` (accepts optional leading `v`, rejects pre-release/build suffixes); `formatVersion(v) -> 'X.Y.Z'`; `compareVersions(a, b) -> -1|0|1`; `bumpVersion(v, level) -> v` (0.x rule); `maxLevel(levels: string[]) -> level | null`; `levelRank(level) -> 0|1|2`; `bumpFloor(messages: string[]) -> level` (full commit messages; floor `patch` for an empty list).

- [ ] **Step 1: Write the failing test** — asserts:
  `parseVersion('v2.5.1')` → `{major:2,minor:5,patch:1}`; `parseVersion('2.5')`, `parseVersion('2.5.1-rc.1')` → `null`;
  `bumpVersion(p('2.5.1'),'minor')` → `2.6.0`; `'major'` → `3.0.0`; `'patch'` → `2.5.2`; `bumpVersion(p('0.4.2'),'major')` → `0.5.0`;
  `compareVersions(p('2.10.0'), p('2.9.9'))` → `1`;
  `maxLevel(['patch','major','minor'])` → `'major'`, `maxLevel([])` → `null`;
  `bumpFloor(['fix: a', 'chore: b'])` → `'patch'`; `bumpFloor(['feat(ui): x'])` → `'minor'`; `bumpFloor(['feat!: drop y'])` → `'major'`; `bumpFloor(['refactor(core)!: z'])` → `'major'`; `bumpFloor(['fix: a\n\nBREAKING CHANGE: removed b'])` → `'major'`; `bumpFloor(['docs: mention feat: in text'])` → `'patch'`; `bumpFloor([])` → `'patch'`.
- [ ] **Step 2:** `node tests/lib/semver.test.js` → FAIL (module not found).
- [ ] **Step 3:** Implement. Type regex on the first line only: `/^(\w+)(\([^)]*\))?(!)?:\s/`.
- [ ] **Step 4:** `node tests/lib/semver.test.js` → `all assertions passed`.
- [ ] **Step 5:** Commit `feat(semver): version parsing, bumps and bump floor`.

### Task 2: `lib/changelog.js` — write side

**Files:**
- Create: `skills/gps/scripts/lib/changelog.js`
- Test: `tests/lib/changelog.test.js`

**Interfaces:**
- Consumes: `LEVELS` (Task 1).
- Produces:
  - `SECTIONS = ['Added','Changed','Deprecated','Removed','Fixed','Security']`
  - `NEW_FILE_HEADER = '# Changelog\n\nAll notable changes to this project. Versions follow [semantic versioning](https://semver.org/).\n'`
  - `VERSION_HEADING_RE` matching `## 2.5.1`, `## 2.5.1 (date)`, `## [2.5.1] - date`, `## v2.5.1` (capture group 1 = `X.Y.Z`).
  - `detectFormat(text: string | null) -> 'new' | 'plain' | 'sections' | 'unknown'` (`sections` when any `### <SECTIONS name>` appears under a `## ` heading; `unknown` when there is no `# ` title line).
  - `readUnreleased(text) -> { exists: boolean, body: string, sessions: string[] }` (session ids from bump markers).
  - `parsePayload(payload: string, format) -> { bullets: string[] } | { sections: { [name]: string[] } }`; throws `UsageError` on: no bullet; a `### ` heading not in SECTIONS; headings when format is `plain`/`new`; bullets outside a heading when format is `sections`.
  - `upsertSessionEntry(text: string | null, { sessionId, bump, entry }) -> string` where `entry` is a `parsePayload` result. Removes every line carrying `<!-- gps:<sessionId> -->` or `session=<sessionId> -->` first; creates the file (NEW_FILE_HEADER) / `## Unreleased` (above the first `VERSION_HEADING_RE` line; else, in `unknown` format, right after the first line; else at end of file — `changelog-apply.js` warns `Unrecognised CHANGELOG.md structure: check the result.` for `unknown`) / missing subsections (SECTIONS order) as needed; appends bullets with the marker suffix; puts the bump line as the last line of the Unreleased block. Preserves `\r\n` if the input uses it.

- [ ] **Step 1: Write the failing tests** (fixtures as inline strings), asserting:
  - `upsertSessionEntry(null, {sessionId:'s1', bump:'minor', entry:{bullets:['- **A.** x']}})` starts with NEW_FILE_HEADER, contains `## Unreleased\n\n- **A.** x <!-- gps:s1 -->\n<!-- gps:bump=minor session=s1 -->`.
  - On gps's own current CHANGELOG head (`## 2.5.1` first heading), Unreleased is inserted immediately before `## 2.5.1`.
  - Same for a file whose first version heading is `## [1.0.0] - 2026-01-01`.
  - Re-run for `s1` with new bullets replaces them; a hand bullet `- hand` and an `s2` entry in the same block are byte-identical after.
  - `sections` format: payload `### Fixed\n- y` merges under an existing `### Fixed` (created between `### Changed` and `### Security` if absent).
  - CRLF input → output has no lone `\n`.
  - `detectFormat` returns each of the four values on matching fixtures; `parsePayload` throws for each listed invalid case.
- [ ] **Step 2:** `node tests/lib/changelog.test.js` → FAIL.
- [ ] **Step 3:** Implement (work on a line array; normalise to `\n` internally, restore `\r\n` on output).
- [ ] **Step 4:** test passes.
- [ ] **Step 5:** Commit `feat(changelog): Unreleased entries with per-session markers`.

### Task 3: `lib/changelog.js` — release side

**Files:**
- Modify: `skills/gps/scripts/lib/changelog.js`
- Test: `tests/lib/changelog.test.js`

**Interfaces:**
- Produces:
  - `readBumpMarkers(text) -> [{ level, sessionId }]` (Unreleased block only).
  - `unreleasedHasEntries(text) -> boolean` (at least one `- ` line).
  - `latestVersion(text) -> 'X.Y.Z' | null` (first `VERSION_HEADING_RE` match).
  - `cutRelease(text, version: string, date: string) -> string` — renames `## Unreleased` to `## <version> (<date>)`, removes bump lines and bullet marker suffixes in that section only, drops empty `### ` subsections; no new Unreleased heading is added.
  - `sectionNotes(text, version) -> string` (body of `## <version> …` up to the next `## `, trimmed).

- [ ] **Step 1: Failing tests:** two sessions (minor, patch) + a hand bullet → `readBumpMarkers` gives both; `cutRelease(…,'2.6.0','2026-10-05')` yields `## 2.6.0 (2026-10-05)`, keeps all three bullets without `<!--`, keeps older sections unchanged, leaves no `## Unreleased`; `sectionNotes` returns the three bullets; `latestVersion` on `## v1.2.3` → `1.2.3`; CRLF preserved.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(changelog): cut a release from Unreleased`.

### Task 4: `lib/version-files.js` and config keys

**Files:**
- Create: `skills/gps/scripts/lib/version-files.js`
- Modify: `skills/gps/scripts/lib/project-config.js` (defaults + validation + `saveVersionFiles`)
- Test: `tests/lib/version-files.test.js`, `tests/lib/project-config.test.js`

**Interfaces:**
- Consumes: `parseVersion`, `formatVersion` (Task 1).
- Produces:
  - `KNOWN_VERSION_FILES = ['package.json', '.claude-plugin/plugin.json', '.claude-plugin/marketplace.json', 'pyproject.toml', 'Cargo.toml', 'CMakeLists.txt']`
  - `detectVersionFiles(projectRoot) -> string[]` (those that exist and hold a readable version).
  - `readVersions(projectRoot, files) -> [{ file, version: string | null }]`
  - `writeVersion(projectRoot, file, version) -> void` — JSON files: top-level `version`, and for `marketplace.json` every `plugins[].version` (rewritten with `writeJsonAtomic`, 2-space indent + trailing newline kept); `pyproject.toml`: `version = "…"` under `[project]` or `[tool.poetry]`; `Cargo.toml`: `version = "…"` under `[package]`; `CMakeLists.txt`: the `VERSION x.y.z` inside the first `project(` call. Text files edited by targeted replacement only.
  - In `project-config.js`: `changelogSettings(projectRoot) -> { enabled, path }`, `releaseSettings(projectRoot) -> { versionFiles: string[] | null, githubRelease }` (defaults applied on read, never written by a read); `saveVersionFiles(projectRoot, files)`; `validate` throws `GpsError` for a non-boolean `changelog.enabled`, a non-string `changelog.path`, or `githubRelease` outside the three values.

- [ ] **Step 1: Failing tests:** in a temp dir with gps-like `package.json`, `plugin.json`, `marketplace.json` (2 plugins) and a CMakeLists with `project(Foo VERSION 1.2.3 LANGUAGES CXX)`: detect returns those four; `writeVersion(...,'1.3.0')` updates each, and CMakeLists keeps `LANGUAGES CXX`; a `pyproject.toml` with a dependency `version = "9"` in another table is untouched. Config: missing keys → defaults; `githubRelease: "sometimes"` → throws matching `/githubRelease/`.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS (both test files).
- [ ] **Step 5:** Commit `feat(release): version files and changelog/release settings`.

### Task 5: git and gh helpers

**Files:**
- Modify: `skills/gps/scripts/lib/git.js`, `skills/gps/scripts/lib/github.js`
- Test: `tests/lib/git.test.js`, `tests/lib/github.test.js`

**Interfaces:**
- Produces in `git.js` (all never throw unless noted):
  - `commitMessages(projectRoot, { base, branch } | { since }) -> string[]` (full messages, `--format=%B%x00`, newest first).
  - `defaultBranch(projectRoot) -> string | null` (`origin/HEAD` symbolic ref, else `main` or `master` if it exists locally).
  - `isCleanTree(projectRoot) -> boolean`.
  - `tagExists(projectRoot, tag) -> boolean`.
  - `createTag(projectRoot, tag, message) -> { ok, reason?, commands? }` (annotated).
  - `headCommit(projectRoot) -> { subject, body, tags: string[] } | null`.
  - `pushWithTags(projectRoot, branch) -> { ok, reason?, commands }` (`git push --follow-tags origin <branch>`).
  - `remoteHasTag(projectRoot, tag) -> boolean` (`git ls-remote --tags origin`).
- Produces in `github.js`: `releaseExists(projectRoot, tag) -> boolean`; `createRelease(projectRoot, { tag, title, notes }) -> { ok, url?, reason?, commands }` (`gh release create <tag> --title <title> --notes-file <tmp>` via `withBodyFile`).
- Existing `commitFiles(projectRoot, files, message)` is reused for both new commits; no new commit helper.

- [ ] **Step 1: Failing tests** in a `gitProject` + local bare origin (pattern from `tests/github-flow.test.js`): `commitMessages` returns a body containing `BREAKING CHANGE:`; `defaultBranch` → `main`; `createTag` then `tagExists` true; `pushWithTags` then `remoteHasTag` true; `headCommit().tags` includes the tag. github: stub gh records `release create v1.0.0 --title 1.0.0 --notes-file …` and `releaseExists` false/true per stub.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(git): tags, push with tags, GitHub releases`.

### Task 6: `changelog-prepare.js` and `changelog-apply.js`

**Files:**
- Create: `skills/gps/scripts/changelog-prepare.js`, `skills/gps/scripts/changelog-apply.js`
- Modify: `skills/gps/scripts/lib/setup.js` (`LOCAL_ONLY` += `'.work/sessions/*/.changelog-payload.md'`)
- Test: `tests/changelog-prepare.test.js`, `tests/changelog-apply.test.js`

**Interfaces:**
- Consumes: Tasks 1, 2, 4, 5; `resolveSession`, `recordEvent`, `commitFiles`, `writeJsonAtomic`.
- Produces:
  - `changelog-prepare.js [--json]` → data `{ enabled, path, format, floor, commits: string[] (subjects), unreleased: string, rerun: boolean, payloadPath }` where `payloadPath = <sessionDir>/.changelog-payload.md`. Commits = `commitMessages` (`{base, branch}` when `config.git`, else `{ since: created_at }`), excluding subjects starting `chore(gps):` or `docs(changelog):`. Disabled → text `Changelog disabled (changelog.enabled = false).` + `Next: finish.js`. Refuses on a finished session or a grill not written (same wording as `finish.js` checks).
  - `changelog-apply.js --bump <level> [--reason "<why>"] [--file <path>] [--json]` (`--file` defaults to `payloadPath`). Order: validate → write CHANGELOG → `commitFiles([path], 'docs(changelog): <feature_name>')` → `config.changelog = { bump, floor, reason, written_at }` via `writeJsonAtomic` → `recordEvent(..., { event: 'changelog_written', detail: { bump } })` → delete payload. Text: `📝 CHANGELOG.md: <bump> (<n> bullet(s)) committed (<sha>)` + `Next: finish.js`. Commit failure: CHANGELOG stays written, `warn` with commands, config still recorded.
  - Refusals (`GpsError`, nothing changed): changelog disabled; bump below floor (`Bump "patch" is below the floor "minor" set by the session's commits.`); bump above floor with no `--reason`; payload missing. `UsageError`: `--bump` not in LEVELS; payload invalid (from `parsePayload`).

- [ ] **Step 1: Failing tests** (drive a session with `h.shipReady` + `h.completeTicket`, which commits `feat: <slug>`):
  - prepare: `floor === 'minor'`, `format === 'new'`, commits include `feat: a`, exclude `chore(gps):` ones; with `changelog.enabled:false` written to `.work/gps-config.json`, `enabled === false`.
  - apply `--bump patch` → exit 1 matching `/below the floor "minor"/`, CHANGELOG.md absent.
  - apply `--bump major` without `--reason` → exit 1; with `--reason "removes x"` → OK; `git log -1 --format=%s` is `docs(changelog): <feature>`; file has `<!-- gps:bump=major session=<id> -->`; `readConfig().changelog.bump === 'major'`; history has `changelog_written`; payload deleted.
  - re-run with new payload → one marker line for the session, not two.
- [ ] **Step 2:** FAIL. **Step 3:** implement both scripts. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(gps): changelog-prepare and changelog-apply`.

### Task 7: `release.js` (suggest + cut)

**Files:**
- Create: `skills/gps/scripts/release.js`
- Test: `tests/release.test.js`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces:
  - `release.js [--json]` → data `{ current, suggested, level, sessions: n, raised: [{sessionId, reason}], versionFiles, mismatches: [{file, version}] }`. Raised reasons come from finished sessions' `.session-config.json` `changelog.reason` matched by session id (read-only). Text: `<current> → <suggested> (<level>: <n> session(s))`, one line per raised reason, mismatch warnings, `Next: ask the user to confirm, then release.js --version <suggested>`. First run with `release.versionFiles` unset: detect and `saveVersionFiles`.
  - `release.js --version X.Y.Z [--json]` → cuts the release: `cutRelease`, `writeVersion` per file, `commitFiles([changelog, ...versionFiles], 'chore(release): X.Y.Z\n\nBump: <level>')`, `createTag('vX.Y.Z', 'X.Y.Z')`. Text ends `Next: ask the user whether to push, then release.js --push`.
  - Base branch = `defaultBranch()`, else the `git.base_branch` of the most recently finished session, else none.
  - Refusals (both modes, nothing changed): base branch known and not checked out, or unknown; dirty tree; changelog disabled; no Unreleased entries; no current version (no version files, no heading) and no `--version` → hint `Pass --version X.Y.Z (e.g. 0.1.0).`; `--version` not `parseVersion`-valid (UsageError); `--version` ≤ current; tag exists.
  - Level with no markers: `patch` + `warn('No gps bump markers under Unreleased: suggesting patch.')`.

- [ ] **Step 1: Failing tests:**
  - Two sessions finished through the scripts (floors `minor` and `patch`), `package.json` at `1.4.2`: suggest → `1.4.2 → 1.5.0 (minor: 2 session(s))`.
  - `--version 1.5.0`: CHANGELOG has `## 1.5.0 (<today>)` and no `<!--`; `package.json` version `1.5.0`; `git log -1 --format=%B` matches `/^chore\(release\): 1\.5\.0\n\nBump: minor/`; `git tag` lists `v1.5.0`.
  - Running `--version 1.5.0` again → exit 1, tree unchanged.
  - `--version 1.4.0` → exit 1 `/greater than/`; on a feature branch → exit 1; with an uncommitted change → exit 1.
  - Review Focus 5: repo with no version file and no heading → exit 1 matching `/--version/`; `--version 0.1.0` succeeds.
  - `package.json` 1.4.2 vs `plugin.json` 1.4.1 → warning names both.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(gps): release.js suggests and cuts a version`.

### Task 8: `release.js --push` + GitHub Release

**Files:**
- Modify: `skills/gps/scripts/release.js`
- Test: `tests/release.test.js`, `tests/github-flow.test.js`

**Interfaces:**
- Consumes: `headCommit`, `pushWithTags`, `remoteHasTag`, `releaseExists`, `createRelease`, `releaseSettings`, `githubEnabled`, `sectionNotes`.
- Produces: `release.js --push [--json]` → data `{ version, pushed: boolean, release: { ok, url } | { skipped: 'policy' | 'github-off' } | { ok:false, reason, commands } }`. Refuses unless `headCommit()` subject matches `^chore\(release\): (\d+\.\d+\.\d+)$` and its tags include `v<that>`. Skips the push when `remoteHasTag`; skips `gh release create` when `releaseExists`. Level read from the `Bump:` body line. Policy: `none` → skip; `minor+` → only `minor`/`major`; `all` → always. `--push` with `--version` → UsageError.

- [ ] **Step 1: Failing tests:** in `release.test.js` (no GitHub): `--push` pushes to a local bare origin, `release.skipped === 'github-off'`; `--push` on a non-release HEAD → exit 1. In `github-flow.test.js` with the stub gh: minor release → stub received `release create v1.5.0`; a patch release under default `minor+` → `skipped: 'policy'`; `githubRelease: "all"` → created; second `--push` → no second push, no second `release create`.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(gps): release.js --push and GitHub Releases`.

### Task 9: Wire into finish, router, docs

**Files:**
- Modify: `skills/gps/references/finish.md`, `skills/gps/SKILL.md`, `skills/gps/scripts/finish.js`, `skills/gps/scripts/help.js`, `skills/gps/scripts/config.js`, `tests/skill.test.js`, `tests/finish.test.js`, `tests/e2e.test.js`, `tests/config.test.js`, `tests/help.test.js`, `README.md`, `CHANGELOG.md`, `.claude/CLAUDE.md` (commands list)
- Create: `skills/gps/references/release.md`, `docs/decisions/0003-changelog-unreleased-then-release.md`

**Interfaces:**
- Consumes: all scripts above.
- `finish.md` new step 1 (renumber the rest): "`changelog-prepare.js`. If enabled: draft user-facing bullets (what a user notices; not refactors or gps bookkeeping) in the file's format and pick the bump (≥ its floor; `--reason` when higher), write them to its `payloadPath`, then `changelog-apply.js --bump <level> [--reason \"…\"]`. Ask nothing. A `❌` stops the finish."
- `release.md` (≤ 40 lines): `release.js`; AskUserQuestion "Release X.Y.Z?" (suggested first "(Recommended)", the other two levels, Other = custom); `release.js --version <v>`; AskUserQuestion "Push and publish?"; yes → `release.js --push`, no → relay the commands. Never run under `/gps auto`.
- `finish.js`: INDEX.md gets `## Changelog` (`- **Bump:** <bump>` + reason) when `config.changelog`; output line `📝 CHANGELOG.md: <bump>` before the PR line.
- `SKILL.md`: table row `| /gps release | Turn Unreleased changelog entries into a version: suggest, bump, tag, push | references/release.md |`, `release` in description and argument-hint, `allowed-tools` lines for `changelog-apply.js`, `changelog-prepare.js`, `release.js` in alphabetical order.
- `skill.test.js`: `expected.finish` += `changelog-prepare.js`, `changelog-apply.js`; `expected.release = ['release.js']`; line 151 regex → `^## X\.Y\.Z( \(\d{4}-\d{2}-\d{2}\))?$`.
- `config.js`: text also shows `changelog.enabled`, `release.versionFiles`, `release.githubRelease` (read-only display).
- `help.js`: workflow step 6 line `**Release** (when you choose): /gps release` and its command entry.

- [ ] **Step 1: Failing tests:** `npm test` after the `skill.test.js` / `finish.test.js` (INDEX has `## Changelog` after apply) / `config.test.js` / `help.test.js` / `e2e.test.js` (start → … → changelog-apply → finish → release `--version` on main after merging the branch) edits → FAIL.
- [ ] **Step 2:** Write references, SKILL.md, finish.js/config.js/help.js changes, README section, decision 0003 (context, decision: Unreleased + release-time version, consequences: concurrent PRs safe, one manual confirm), gps's own CHANGELOG `## Unreleased` bullets for this feature.
- [ ] **Step 3:** `npm test` → all pass; `node tests/check-skill-size.js --max 200` → OK.
- [ ] **Step 4:** Commit `feat(gps): /gps release and changelog step in /gps finish`.
