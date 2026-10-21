# Move the idea skill into grill-plan-ship Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the `idea` skill (currently `~/dotfiles/claude/skills/idea/`, a personal-dotfiles-only backlog tool) into the `grill-plan-ship` plugin as a new sibling skill, `skills/idea/`, so it ships to every gps user as `/idea <verb>`.

**Architecture:** `idea` becomes a second, independent skill beside `skills/gps/` in this plugin — its own `SKILL.md`, `references/`, `scripts/`, and a `tests/idea/` tree mirroring the existing `tests/` conventions — not a `/gps` subcommand (the 7 verbs and their grill/save-check depth don't fit the router's 40-line-per-reference, single-word-command budget). It still calls into `/gps start` and `/gps write` exactly as today (Promote). Three things change from the dotfiles version: (1) gps's existing "scouted idea" wording (from `/gps scout`) is renamed to "seed" throughout gps's own files, freeing "Idea" for this skill, since both concepts living in one plugin under the same word would confuse users; (2) `idea`'s scripts are split one-purpose-per-file and adopt this repo's `lib/cli.js` entry-point contract, matching every other script in the plugin; (3) "Global" (not tied to a repo) Ideas no longer auto-discover their store by walking up from the script's own directory to `dotfiles/claude/skills/idea/SKILL.md` — that broke once the skill ships inside a distributed plugin whose install location isn't the user's own perpetual repo. Instead the user names their own personal repo once via a new `/idea config --set-global-root <path>` script, stored in a small per-user config file outside any project or plugin install.

**Tech Stack:** Node.js (`node --test`), the existing gps script/test conventions (`lib/cli.js` contract, `GpsError`/`UsageError`-style errors, `node:fs`/`node:child_process` only, no external dependencies).

**Spec:** No separate spec document; the existing `~/dotfiles/claude/skills/idea/` tree (`SKILL.md`, `references/*.md`, `scripts/idea.js`, `scripts/lib/{idea-file,scope,git}.js`, `tests/*.test.js`) is the spec, together with three decisions already made in this conversation: idea is a sibling skill, not a `/gps` subcommand; gps's scout wording becomes "seed"; Global Ideas point at a user-configured personal repo rather than the plugin's own location. The behavior documented in `dotfiles/docs/adr/0001-ideas-are-a-separate-store-not-parked-gps-sessions.md` (Promote opens a fresh `/gps start` session; `/gps write`, not `/gps plan`, is what marks an Idea promoted) carries over unchanged.

## Global Constraints

- `tests/skill.test.js`'s existing assertions about `skills/gps/` (single-word `/gps <command>` router, ≤40-line references, ≤100-line `SKILL.md`, one allowed-tools line per script, one test file per script/lib) must keep passing unmodified — this plan adds a new, parallel `skills/idea/` tree and `tests/idea/skill.test.js`, and never touches gps's router test's assumptions about itself.
- Every new script's entry point is `main({ usage, positionals, options, run })` from the skill's own `lib/cli.js` (CLAUDE.md "Rules for scripts"); one purpose per script; git calls only through the skill's own `lib/git.js` via `execFileSync` with an argument array.
- No change to `GPS_WORK_PATHS` or `docs/WORK-DIR.md`'s owned-paths table: `idea` writes only inside `.work/idea/` (Project scope), which is already "a skill's own space" under the existing contract, requiring no gps-side change.
- `npm test` (`node tests/run.js`) auto-discovers every `**/*.test.js` under `tests/`; no changes to `tests/run.js` are needed for the new `tests/idea/` subtree.
- Never commit anything outside this plan's own files; follow existing commit-message conventions (`feat:`, `fix:`, `refactor:`, `chore:`, `docs:` prefixes, as seen in `git log`).

## Review Focus

- **A `--global` save with no personal repo configured yet** must fail with one clear message pointing at `idea-config.js --set-global-root <path>`, not a confusing "`.work/` is missing" message aimed at the wrong fix.
- **A configured `--set-global-root` path that doesn't exist, isn't a directory, or isn't a git repository** must be refused by `idea-config.js` before anything is written, with a concrete reason (not a raw `ENOENT`/git stderr dump).
- **Running `/gps status`, `/gps clean`, or `/gps scout` after the rename** must show "seed" consistently in both the human text and the `--json` field names (`seeds`, `seedsProblem`) — a half-renamed surface (prose says "seed" but JSON still says `ideas`) is worse than the original collision.
- **An existing project that already has `.work/idea/<slug>.md` files is untouched by the rename task** — Task 1 only changes gps's scout/status/clean vocabulary, never touches `.work/idea/` or Idea files, since those don't exist until Task 4 ships.
- **Two different scopes resolving to the same slug** (a Project Idea and a Global Idea both named `x`, or a Global repo that is also the cwd's Project repo) must keep behaving exactly as the ported `idea-find.js`/`idea-save.js` tests already pin today — the config-based Global root must not change Project-vs-Global disambiguation, only how the Global root is located.

---

## File Structure

```
skills/idea/
├── SKILL.md
├── references/
│   ├── capture.md        (ported; save-checks reworded for configured-repo Global)
│   ├── start.md           (ported, path/script names updated)
│   ├── plan.md             (ported)
│   ├── review.md           (ported)
│   ├── promote.md         (ported)
│   ├── drop.md             (ported)
│   ├── list.md              (ported)
│   └── config.md         (new: /idea config)
└── scripts/
    ├── idea-resolve.js
    ├── idea-find.js
    ├── idea-save.js
    ├── idea-list.js
    ├── idea-promote-check.js
    ├── idea-config.js
    └── lib/
        ├── cli.js          (copied from skills/gps/scripts/lib/cli.js, GpsError -> IdeaError)
        ├── guard.js        (new, small: IdeaError, UsageError, replaceFile, writeTextAtomic)
        ├── idea-file.js    (ported unchanged)
        ├── scope.js        (rewritten: config-based Global root, no directory walk)
        └── git.js          (ported unchanged)

tests/idea/
├── helpers.js
├── skill.test.js
├── idea-resolve.test.js
├── idea-find.test.js
├── idea-save.test.js
├── idea-list.test.js
├── idea-promote-check.test.js
├── idea-config.test.js
└── lib/
    ├── cli.test.js
    ├── guard.test.js
    ├── idea-file.test.js  (ported from dotfiles tests/idea-file.test.js)
    ├── scope.test.js      (rewritten)
    └── git.test.js        (extracted from dotfiles tests/scope.test.js's commitPaths cases)
```

Existing files touched: `skills/gps/SKILL.md`, `skills/gps/references/clean.md`, `skills/gps/scripts/{clean,status,help,scout-merge}.js`, `skills/gps/scripts/lib/{clean,status,seeds-store,setup}.js`, `tests/{clean,status,help,scout-merge}.test.js`, `tests/lib/{clean,status}.test.js`, `README.md`, `.claude/CLAUDE.md`, `CHANGELOG.md`, three new `docs/decisions/NNNN-*.md` files.

## Task 1: Rename gps's "scouted idea" to "seed"

**Files:**
- Modify: `skills/gps/SKILL.md:43,45,46`, `skills/gps/references/clean.md`, `skills/gps/scripts/clean.js`, `skills/gps/scripts/status.js`, `skills/gps/scripts/help.js:25,73`, `skills/gps/scripts/scout-merge.js:44,49`, `skills/gps/scripts/lib/clean.js`, `skills/gps/scripts/lib/status.js`, `skills/gps/scripts/lib/seeds-store.js` (comment only), `skills/gps/scripts/lib/setup.js` (comment only), `README.md:46,48,49,66`.
- Test: `tests/clean.test.js`, `tests/status.test.js`, `tests/help.test.js`, `tests/scout-merge.test.js`, `tests/lib/clean.test.js`, `tests/lib/status.test.js`.

**Interfaces:**
- Produces (for Task 6's changelog bullet): the renamed public surface — human text says "seed(s)" wherever it said "idea(s)" about `/gps scout` output; `--json` field names `ideas` → `seeds` and `ideasProblem` → `seedsProblem` on `clean.js`, `status.js`, and their `lib/` counterparts; identifiers `listIdeas` → `listSeeds`, `listPendingIdeas` → `listPendingSeeds`, `ideasTable` → `seedsTable`, `ideasProblem` → `seedsProblem` (variable names) in `lib/clean.js` and `lib/status.js`.

- [ ] **Step 1: Update failing/outdated test assertions first**

In `tests/clean.test.js`, `tests/status.test.js`, `tests/help.test.js`, `tests/scout-merge.test.js`, `tests/lib/clean.test.js`, `tests/lib/status.test.js`, change every assertion that matches the word "idea" in output text or a JSON field name (e.g. `report.ideas`, `/Scouted ideas/`, `"idea(s)"`) to its "seed" equivalent. Keep every other assertion unchanged. Do not run yet — these will fail until Step 2.

- [ ] **Step 2: Rename the implementation**

In `skills/gps/scripts/lib/clean.js`: rename `listIdeas` to `listSeeds`, its `{ ideas, problem }` return to `{ seeds, problem }`; in `planDeletion`, rename the local `ideas` array/field to `seeds` and `plan.ideas` to `plan.seeds`; in `renderList`/`renderPlan`, change the headings/lines ("Scouted ideas not started" -> "Scouted seeds not started", "idea ${i.slug}" -> "seed ${i.slug}", table header "| Idea |" -> "| Seed |") and the "Ideas can't be dropped" warning text. In `skills/gps/scripts/clean.js`: rename the destructured `ideas`/`ideasProblem` to `seeds`/`seedsProblem`, the `NOTHING` message, and the `data`/text field names and `✅ Dropped scouted idea` line to say "seed". In `skills/gps/scripts/lib/status.js`: rename `listPendingIdeas` to `listPendingSeeds`, its `ideas`/`ideasProblem` fields to `seeds`/`seedsProblem`, `ideasTable` to `seedsTable`, and the "## Scouted ideas not started" / "scouted idea(s)" text. In `skills/gps/scripts/status.js`: rename the destructured fields and the `report.ideas`/`report.ideasProblem` checks to match. In `skills/gps/scripts/help.js`: change "turns a codebase review into ideas" to "into seeds" and "/gps scout for ideas" to "for seeds". In `skills/gps/scripts/scout-merge.js`: change "Seeded N idea(s)" to "Seeded N seed(s)" and "the idea to pursue" to "the seed to pursue". Update the doc comments at the top of `lib/seeds-store.js` and `lib/setup.js` that still say "ideas" to say "seeds" (code identifiers there — `mergeSeeds`, `getSeed`, etc. — are already correctly named; only the prose comments change). In `skills/gps/SKILL.md` and `skills/gps/references/clean.md`: change "ideas"/"idea slug" to "seeds"/"seed slug" in the command-table and `/gps clean` descriptions. In `README.md`: change lines 46, 48, 49, 66 the same way.

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: every test passes, including the edited assertions from Step 1.

- [ ] **Step 4: Commit**

```bash
git add skills/gps README.md tests/clean.test.js tests/status.test.js tests/help.test.js tests/scout-merge.test.js tests/lib/clean.test.js tests/lib/status.test.js
git commit -m "refactor: rename gps's scouted-idea wording to seed, freeing 'idea' for the new idea skill"
```

## Task 2: Idea skill's shared lib foundation (cli.js, guard.js, idea-file.js, git.js)

**Files:**
- Create: `skills/idea/scripts/lib/cli.js`, `skills/idea/scripts/lib/guard.js`, `skills/idea/scripts/lib/idea-file.js`, `skills/idea/scripts/lib/git.js`.
- Test: `tests/idea/lib/cli.test.js`, `tests/idea/lib/guard.test.js`, `tests/idea/lib/idea-file.test.js`, `tests/idea/lib/git.test.js`.

**Interfaces:**
- Produces: `cli.js` exports `{ main, runScript, parseArgs, warn, EXIT_OK, EXIT_FAILURE, EXIT_USAGE }` with the identical contract as `skills/gps/scripts/lib/cli.js` (positionals/options parsing, `--json`, `--help`, exit codes). `guard.js` exports `{ IdeaError, UsageError, replaceFile, writeTextAtomic }`: `IdeaError extends Error` with `.hint`; `UsageError extends IdeaError`; `replaceFile(filePath, content, io = fs)` and `writeTextAtomic(filePath, text, io = fs)` (the latter just calls `replaceFile(filePath, text, io)` — Idea files are markdown, not JSON, so there is no `writeJsonAtomic` here). `idea-file.js` exports exactly `{ slugify, validateSlug, parseIdea, serializeIdea, checkBody, nextStatus }`, unchanged from `~/dotfiles/claude/skills/idea/scripts/lib/idea-file.js`. `git.js` exports `{ git, isRepo, commitPaths }`, unchanged from `~/dotfiles/claude/skills/idea/scripts/lib/git.js`.
- Consumes: nothing from `skills/gps/`.

- [ ] **Step 1: Write the failing tests**

Copy `~/dotfiles/claude/skills/idea/tests/idea-file.test.js` to `tests/idea/lib/idea-file.test.js` unchanged except the `require` path (`../../../skills/idea/scripts/lib/idea-file`). Extract the three `commitPaths` tests from `~/dotfiles/claude/skills/idea/tests/scope.test.js` (lines 156–185: `"commits only the given paths..."`, `"skips outside a git repository"`, `"nothing changed gives a skip, not an error"`) into a new `tests/idea/lib/git.test.js`, reusing a local `git`/`tmpDir`/`makeRepo` helper copied from `~/dotfiles/claude/skills/idea/tests/helpers.js` into `tests/idea/helpers.js` (see Task 3 for the rest of that file). Write `tests/idea/lib/cli.test.js` by adapting `skills/gps/scripts/lib/cli.js`'s own tests (find them under `tests/lib/cli.test.js`) to import from `skills/idea/scripts/lib/cli.js`, keeping the same cases (positionals/options parsing, `--json`, `--help`, usage vs. failure exit codes). Write `tests/idea/lib/guard.test.js`: `test("IdeaError carries a hint", ...)`, `test("UsageError is an IdeaError", () => assert.ok(new UsageError('x') instanceof IdeaError))`, `test("writeTextAtomic replaces a file's full content", ...)` (write, then overwrite, assert final content), `test("replaceFile falls back to a direct write when rename fails with EPERM/EACCES", ...)` (inject an `io` stub whose `renameSync` throws `{ code: 'EPERM' }`, as `skills/gps/scripts/lib/guard.test.js` already does for its `replaceFile`).

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/idea/lib/idea-file.test.js tests/idea/lib/git.test.js tests/idea/lib/cli.test.js tests/idea/lib/guard.test.js`
Expected: FAIL (module not found) for every file.

- [ ] **Step 3: Implement**

Copy `~/dotfiles/claude/skills/idea/scripts/lib/idea-file.js` to `skills/idea/scripts/lib/idea-file.js` verbatim, and `~/dotfiles/claude/skills/idea/scripts/lib/git.js` to `skills/idea/scripts/lib/git.js` verbatim. Copy `skills/gps/scripts/lib/cli.js` to `skills/idea/scripts/lib/cli.js`, then replace its `require('./guard')` destructure and the two `GpsError`/`UsageError` identifiers it reads from guard with `IdeaError`/`UsageError` (the rest of the file — `parseArgs`, `runScript`, `main`, `runScriptAsync`, `mainAsync`, `warn` — is otherwise identical). Write `skills/idea/scripts/lib/guard.js` with `IdeaError`/`UsageError` (same shape as `skills/gps/scripts/lib/guard.js`'s `GpsError`/`UsageError`) and `replaceFile`/`writeTextAtomic` ported from the same file's `replaceFile`/`writeJsonAtomic` pair, swapping the JSON serialization for plain text.

- [ ] **Step 4: Run to verify they pass**

Run: `node --test tests/idea/lib/idea-file.test.js tests/idea/lib/git.test.js tests/idea/lib/cli.test.js tests/idea/lib/guard.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add skills/idea/scripts/lib tests/idea/lib
git commit -m "feat: add the idea skill's shared lib (cli, guard, idea-file, git)"
```

## Task 3: Global-root configuration (scope.js, idea-config.js)

**Files:**
- Create: `skills/idea/scripts/lib/scope.js`, `skills/idea/scripts/idea-config.js`.
- Test: `tests/idea/lib/scope.test.js`, `tests/idea/idea-config.test.js`.

**Interfaces:**
- Consumes: `git`, `isRepo` from `./lib/git` (Task 2); `IdeaError`, `replaceFile` from `./lib/guard` (Task 2).
- Produces: `scope.js` exports `{ globalConfigPath(), readGlobalConfig(), writeGlobalConfig({ globalRoot }), repoRoot(cwd), defaultBranch(root), currentBranch(root), resolveScope({ cwd, global, globalRoot }), listIdeaSlugs(ideaDir) }`. `globalConfigPath()` returns `process.env.GPS_IDEA_CONFIG_PATH || path.join(os.homedir(), '.gps', 'idea-config.json')` (the env var is a test hook only, exactly as `IDEA_DOTFILES_ROOT` was). `readGlobalConfig()` returns `{ globalRoot: string|null }` (`null` when the file is missing or unreadable — never throws). `writeGlobalConfig({ globalRoot })` validates `globalRoot` is an existing directory and `isRepo(globalRoot)`, throwing `IdeaError` otherwise with a hint to `git init` or pick another path; on success it `mkdirSync`s the config file's directory and writes `{ globalRoot }` via `replaceFile` (JSON, 2-space indent). `resolveScope` keeps the exact same return shape as the dotfiles version (`{ scope, ideaDir, gitRoot, inRepo, workDirExists, branch, defaultBranch, offDefaultBranch, globalDir }`), but takes `globalRoot` (a plain string or `undefined`) instead of `dotfilesRoot`, and throws `IdeaError` when `global: true` and `globalRoot` is falsy ("No personal repo configured for Global Ideas. Run `idea-config.js --set-global-root <path>` first."). `idea-config.js`'s `run()` returns, with no `--set-global-root`: `{ text: 'global root: <path>' or 'global root: not configured', data: { globalRoot } }`; with `--set-global-root <path>`: validates and writes, then returns `{ text: 'global root set to <path>', data: { globalRoot: path } }`.

- [ ] **Step 1: Write the failing tests**

In `tests/idea/lib/scope.test.js`, port every test from `~/dotfiles/claude/skills/idea/tests/scope.test.js` *except* the `commitPaths` ones (moved to `git.test.js` in Task 2) and `findDotfilesRoot`'s (replaced below), rewriting each call site's `dotfilesRoot: dot` to `globalRoot: dot` and `makeFakeDotfiles()` to a plain `makeRepo()` (no `SKILL.md` marker file needed any more — add this helper change to `tests/idea/helpers.js`, see Task 4). Add new cases: `test("resolveScope: --global throws without a configured globalRoot", () => assert.throws(() => resolveScope({ cwd: tmpDir(), global: true, globalRoot: undefined }), /No personal repo configured/))`; `test("readGlobalConfig: null when the file is missing", ...)`; `test("readGlobalConfig: reads back what writeGlobalConfig wrote", ...)`; `test("writeGlobalConfig: rejects a path that is not a git repository", () => assert.throws(() => writeGlobalConfig({ globalRoot: tmpDir() })))`; `test("writeGlobalConfig: rejects a path that does not exist", ...)`; `test("globalConfigPath: GPS_IDEA_CONFIG_PATH overrides the default", ...)` (mirrors the existing `findDotfilesRoot: env override wins` test's `withEnv` pattern, renamed to the new env var).

In `tests/idea/idea-config.test.js`, write: `test("idea-config.js: shows 'not configured' with no config file", ...)`; `test("idea-config.js --set-global-root <path>: writes the config, --json reflects it", ...)`; `test("idea-config.js --set-global-root <path>: refuses a non-repository path, writes nothing", ...)` (run with `runRaw`-equivalent, assert exit 1, assert the config file still doesn't exist); `test("idea-config.js: a later call with no flag reads back what was set", ...)`.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/idea/lib/scope.test.js tests/idea/idea-config.test.js`
Expected: FAIL (module not found / assertion errors).

- [ ] **Step 3: Implement**

Write `skills/idea/scripts/lib/scope.js` starting from `~/dotfiles/claude/skills/idea/scripts/lib/scope.js`: delete `findDotfilesRoot` and `SKILL_MARKER` entirely; add `globalConfigPath`, `readGlobalConfig`, `writeGlobalConfig` as specified above; change `resolveScope`'s `global` branch to take `globalRoot` directly (no `dotfilesRoot` lookup) and throw `IdeaError` when it's falsy; keep `repoRoot`, `defaultBranch`, `currentBranch`, `hasLocalBranch`, `listIdeaSlugs` unchanged. Write `skills/idea/scripts/idea-config.js` using `main({ usage: 'idea-config.js [--set-global-root <path>] [--json]', positionals: { min: 0, max: 0 }, options: { 'set-global-root': 'string' }, run({ options }) {...} })` from `./lib/cli`, calling `readGlobalConfig`/`writeGlobalConfig` from `./lib/scope`.

- [ ] **Step 4: Run to verify they pass**

Run: `node --test tests/idea/lib/scope.test.js tests/idea/idea-config.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add skills/idea/scripts/lib/scope.js skills/idea/scripts/idea-config.js tests/idea/lib/scope.test.js tests/idea/idea-config.test.js
git commit -m "feat: resolve the idea skill's Global root from a per-user config file"
```

## Task 4: The five idea action scripts

**Files:**
- Create: `skills/idea/scripts/idea-resolve.js`, `skills/idea/scripts/idea-find.js`, `skills/idea/scripts/idea-save.js`, `skills/idea/scripts/idea-list.js`, `skills/idea/scripts/idea-promote-check.js`.
- Test: `tests/idea/idea-resolve.test.js`, `tests/idea/idea-find.test.js`, `tests/idea/idea-save.test.js`, `tests/idea/idea-list.test.js`, `tests/idea/idea-promote-check.test.js`.
- Modify: `tests/idea/helpers.js` (add `setup()`, `bodyFile()`, `subjects()` ported from `~/dotfiles/claude/skills/idea/tests/helpers.js` and `cli.test.js`'s local helpers — see Task 2's Step 1 reference to this file; by this task it must also export a `runScript(cwd, script, args, env)` wrapper that sets `GPS_IDEA_CONFIG_PATH` the same way the old `IDEA_DOTFILES_ROOT` env var was set per-call).

**Interfaces:**
- Consumes: `main`, `UsageError`, `IdeaError` (Task 2); `validateSlug`, `parseIdea`, `serializeIdea`, `checkBody`, `nextStatus` from `./lib/idea-file` (Task 2); `commitPaths` from `./lib/git` (Task 2); `resolveScope`, `readGlobalConfig`, `listIdeaSlugs` from `./lib/scope` (Task 3).
- Produces: five scripts with the exact CLI surface `idea.js`'s subcommands had (same flags, same `--json` shapes, same exit codes), documented per-script below, for `references/*.md` (Task 5) to call by name.
  - `idea-resolve.js [--global] [--json]` — same output shape as old `cmdResolve`, with `globalRoot` resolved via `readGlobalConfig()` before calling `resolveScope`.
  - `idea-find.js <slug> [--json]` — identical to old `cmdFind`.
  - `idea-save.js <slug> --action <capture|grill|plan|review|promote|drop> [--global] [--body-file <f>] [--event "<text>"] [--promoted-to "<repo>:<session-id>"] [--create-work-dir] [--json]` — identical to old `cmdSave`, writing the Idea file via `writeTextAtomic` instead of a bare `fs.writeFileSync`.
  - `idea-list.js [--all] [--json]` — identical to old `cmdList`.
  - `idea-promote-check.js <session-id> [--json]` — identical to old `cmdPromoteCheck`.

- [ ] **Step 1: Write the failing tests**

Split `~/dotfiles/claude/skills/idea/tests/cli.test.js` by subcommand into the five new files, one `test(...)` block moving to its matching file unchanged in assertions, only the script path and the `run`/`runJson`/`runRaw` helpers' target script name changing (each test file runs exactly one of the five new scripts, never `idea.js`). `idea-save.test.js` gets the largest share: the full `capture → grill → plan → review → promote` lifecycle test, the transition-refusal tests, the usage-error tests, the missing-`.work/` tests, and the `--global` test (updated to use the new `GPS_IDEA_CONFIG_PATH`-based helper from Task 3 instead of `IDEA_DOTFILES_ROOT`). `idea-resolve.test.js` gets the `"resolve: prints the scope object"` test. `idea-find.test.js` gets the `"find: searches both scopes"` test. `idea-list.test.js` gets the `"list: groups by status..."` test. `idea-promote-check.test.js` gets the `"promote-check: reads feature_name and current_phase"` test.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/idea/idea-resolve.test.js tests/idea/idea-find.test.js tests/idea/idea-save.test.js tests/idea/idea-list.test.js tests/idea/idea-promote-check.test.js`
Expected: FAIL (module not found) for every file.

- [ ] **Step 3: Implement**

For each script, take the matching `cmd*` function body out of `~/dotfiles/claude/skills/idea/scripts/idea.js` and wrap it in `main({ usage, positionals: { min, max }, options, run({ positionals, options, projectRoot, warn }) {...} })` from `./lib/cli`, keeping every existing validation (`checkSlug`, action/flag cross-checks, body-file reading, the four write-order subtleties in `cmdSave`) and every error message byte-for-byte, except: replace the hand-rolled `CliError`/`usageError`/`fail` with `UsageError`/`IdeaError` from `./lib/guard`; replace `fs.writeFileSync(file, serializeIdea(idea), "utf8")` in the save script with `writeTextAtomic(file, serializeIdea(idea))`; replace every `dotfilesRootOrNull()`/`dotfilesRootOrFail()` call with `readGlobalConfig().globalRoot` (null is the "not configured" case `resolveScope` already turns into an `IdeaError` when `global` is true). `readSessions`/`readSessionConfig` (used by `idea-list.js` and `idea-promote-check.js`) move into whichever of those two files needs them (duplicated rather than shared, since each is ~15 lines and the two scripts have no other shared code — consistent with "one purpose per script, no hidden state").

- [ ] **Step 4: Run to verify they pass**

Run: `node --test tests/idea/idea-resolve.test.js tests/idea/idea-find.test.js tests/idea/idea-save.test.js tests/idea/idea-list.test.js tests/idea/idea-promote-check.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add skills/idea/scripts/idea-resolve.js skills/idea/scripts/idea-find.js skills/idea/scripts/idea-save.js skills/idea/scripts/idea-list.js skills/idea/scripts/idea-promote-check.js tests/idea/idea-resolve.test.js tests/idea/idea-find.test.js tests/idea/idea-save.test.js tests/idea/idea-list.test.js tests/idea/idea-promote-check.test.js tests/idea/helpers.js
git commit -m "feat: port the idea skill's CLI as five single-purpose scripts"
```

## Task 5: SKILL.md, references, and the skill's own structural test

**Files:**
- Create: `skills/idea/SKILL.md`, `skills/idea/references/{capture,start,plan,review,promote,drop,list,config}.md`, `tests/idea/skill.test.js`.

**Interfaces:**
- Consumes: the five scripts and `idea-config.js` (Tasks 3–4), named exactly as in this task's references.
- Produces: `/idea <verb>` as a working, self-consistent skill, checked the same way `tests/skill.test.js` checks `/gps`.

- [ ] **Step 1: Write the failing structural test**

Write `tests/idea/skill.test.js` as a trimmed adaptation of `tests/skill.test.js`'s router checks, pointed at `skills/idea` instead of `skills/gps`: `SKILL.md` frontmatter names `idea`, an `argument-hint`, and one `allowed-tools` `Bash(node ${CLAUDE_SKILL_DIR}/scripts/<name>.js *)` line per script in `skills/idea/scripts/*.js` (six scripts: the five from Task 4 plus `idea-config.js`); the command table (`/idea (capture|start|plan|review|promote|drop|list|config)`) lists exactly the eight `references/*.md` files, one to one; `SKILL.md` stays under 100 lines, every reference under 40; every `idea-*.js` name mentioned in `SKILL.md` or a reference exists on disk, and every script on disk is named by at least one reference; one test file under `tests/idea/` exists per script and per `lib/` file.

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/idea/skill.test.js`
Expected: FAIL (`skills/idea/SKILL.md` not found).

- [ ] **Step 3: Write SKILL.md and the references**

Port `~/dotfiles/claude/skills/idea/SKILL.md` to `skills/idea/SKILL.md`: update `allowed-tools` to list the six script names from Task 4's "Produces" plus `idea-config.js`; add a `config` row to the command table (`/idea config [--set-global-root <path>]` → `references/config.md`); change "Global scope is `dotfiles/.work/idea/global/`" to "Global scope is the `.work/idea/global/` of your configured personal repo (`/idea config`)"; everywhere else `idea.js` is mentioned as a single script, replace with the specific script name for that subcommand (e.g. `idea.js save ...` becomes `idea-save.js ...`).

Port each `references/*.md` file, replacing every `idea.js <subcommand>` call with the matching script name, and updating `capture.md`'s "Missing `.work/`" save check: before check 1, add a line that when `--global` is intended and `idea-resolve.js --global` fails because no personal repo is configured, point the user at `idea-config.js --set-global-root <path>` and stop (nothing to ask); change the Global bullet of check 1 from "`.work/` belongs to dotfiles, the skill's own store" to "`.work/` belongs to your configured personal repo". Write `references/config.md` new: **When:** before the first Global Idea, or to change which personal repo holds them. Steps: bare `/idea config` shows the current setting; `/idea config --set-global-root <path>` runs `idea-config.js --set-global-root <path>`, relays its confirmation or `❌`.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/idea/skill.test.js`
Expected: PASS

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: every test in `tests/` (gps's and idea's) passes.

- [ ] **Step 6: Commit**

```bash
git add skills/idea/SKILL.md skills/idea/references tests/idea/skill.test.js
git commit -m "feat: add the idea skill's SKILL.md, references and structural test"
```

## Task 6: Project docs — CLAUDE.md, README, ADRs, CHANGELOG

**Files:**
- Modify: `.claude/CLAUDE.md`, `README.md`, `CHANGELOG.md`.
- Create: `docs/decisions/0008-scouted-ideas-are-called-seeds.md`, `docs/decisions/0009-idea-skill-is-a-sibling-not-a-gps-subcommand.md`, `docs/decisions/0010-global-ideas-live-in-a-configured-personal-repo.md`.

**Interfaces:** none (documentation only).

- [ ] **Step 1: Update `.claude/CLAUDE.md`**

In the Layout section, add a `skills/idea/` entry alongside `skills/gps/` describing it as the Idea backlog skill (same shape: `SKILL.md`, `references/<cmd>.md`, `scripts/<name>.js`, `scripts/lib/`). In the top summary line, change "Commands: init, scout, start (`--issue`), status, clean, config, write, plan, ship (N), finish, auto, release, handoff, help." to add a second sentence: "idea skill commands: capture, start, plan, review, promote, drop, list, config."

- [ ] **Step 2: Update `README.md`**

Add a `/idea` row set to the Commands table (or a short new subsection) listing the eight verbs with one-line descriptions, matching the existing table's style; add one example line each for `/idea capture`, `/idea start`, `/idea promote`.

- [ ] **Step 3: Write the three ADRs**

`0008-scouted-ideas-are-called-seeds.md`: context (gps's `/gps scout` already called its candidates "ideas" in prose and JSON, colliding with the incoming Idea-backlog skill's own "Idea"), decision (rename to "seed", matching the already-seed-named internals of `seeds-store.js`), consequences (breaking `--json` field rename on `clean.js`/`status.js`, called out in the changelog).

`0009-idea-skill-is-a-sibling-not-a-gps-subcommand.md`: context (`tests/skill.test.js` fixes `/gps` to single-word commands and 40-line references; idea's 7–8 verbs and their grill/save-check depth don't fit), decision (a second, independent skill, `skills/idea/`, in the same plugin), consequences (two routers, two structural tests, duplicated small `lib/cli.js`-style plumbing rather than cross-skill imports).

`0010-global-ideas-live-in-a-configured-personal-repo.md`: context (the dotfiles version found its Global store by walking up to its own `SKILL.md`, which only works when the skill's code lives inside the user's own perpetual repo — false once it ships as a plugin), decision (a per-user config file, `~/.gps/idea-config.json`, named once via `idea-config.js --set-global-root <path>`), consequences (a first-time `--global` save needs that one-time setup step; existing dotfiles users must run it once to keep Global Ideas working).

- [ ] **Step 4: Add the CHANGELOG `## Unreleased` section**

At the top of `CHANGELOG.md`, under the `# Changelog` heading and above `## 2.8.6 (2026-10-19)`, add:

```markdown
## Unreleased

- Add the `idea` skill (`/idea capture|start|plan|review|promote|drop|list|config`): a backlog for future work, kept apart from gps sessions, promoting into a fresh `/gps start` session when it's time to build. Global (not-repo-tied) Ideas live in a personal repo you name once with `/idea config --set-global-root <path>`.
- Rename `/gps scout`'s "scouted idea(s)" to "seed(s)" in text and `--json` output (`ideas` -> `seeds`, `ideasProblem` -> `seedsProblem` on `clean.js` and `status.js`), freeing "Idea" for the new `idea` skill.
```

- [ ] **Step 5: Run the whole suite one more time**

Run: `npm test`
Expected: every test passes (this task touches no code the tests check beyond `CHANGELOG.md`'s existing-version-heading assertion, which still matches).

- [ ] **Step 6: Commit**

```bash
git add .claude/CLAUDE.md README.md CHANGELOG.md docs/decisions/0008-scouted-ideas-are-called-seeds.md docs/decisions/0009-idea-skill-is-a-sibling-not-a-gps-subcommand.md docs/decisions/0010-global-ideas-live-in-a-configured-personal-repo.md
git commit -m "docs: document the idea skill, the seed rename and the Global-root config"
```
