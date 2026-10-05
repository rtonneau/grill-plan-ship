# Shared `.work/` Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** gps commits only the `.work/` paths it owns, and `docs/WORK-DIR.md` tells other skills how to share `.work/` without breaking gps.

**Architecture:** One exported constant, `GPS_WORK_PATHS` in `skills/gps/scripts/lib/git.js`, is the single list of paths gps owns. `commitWorkDir` stages and commits only those paths. `docs/WORK-DIR.md` documents the contract, and `tests/skill.test.js` checks that every entry in the constant appears in the doc.

**Tech Stack:** Node.js built-ins only; tests are plain `assert` scripts run by `npm test`.

**Spec:** `docs/superpowers/specs/2026-10-05-work-dir-contract-design.md`

## Global Constraints

- Paths gps owns, exactly: `.work/gps-config.json`, `.work/GLOSSARY.md`, `.work/adr`, `.work/sessions`.
- Other skills write only inside `.work/<skill-name>/`.
- Stable `.session-config.json` fields promised to other skills: `current_phase`, `kind`, `feature_name`, `git.branch`.
- Version 2.5.0 in `package.json`, `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` (all three equal).
- Git calls stay in `lib/git.js`, through the existing `git` / `tryGit` helpers (`execFileSync` with an argument array).
- `commitWorkDir` keeps its return shape: `{ ok: true, sha, files, skipped }` or `{ ok: false, reason, commands }`.

## Review Focus

Git facts checked by hand on 2026-10-05 that the code relies on:
- `git add -A -- <path>` fails (exit 128, "did not match any files") when the path is neither on disk nor tracked.
- `git add -A -- <path>` succeeds when the path is tracked but deleted.
- `git commit -- <dir>` fails ("did not match any file(s) known to git") when the directory holds no tracked file, even if other pathspecs in the same call have staged changes.

Failure modes, most likely first. Each one gets a test in Task 1.
1. **Fresh session with only ignored files.** `.work/sessions/` holds only `.current-session` (ignored) and `gps-config.json` changed. Expected: the config is committed and there's no pathspec error. To cover this, the commit pathspec only includes owned paths that hold a staged file.
2. **An owned path the user has git-ignored**, e.g. `.work/gps-config.json` in `.gitignore`. Expected: it's skipped, and the other owned paths are still committed. `git add` of an explicitly named ignored path fails, so ignored untracked paths are filtered out.
3. **A file from another skill already staged by the user.** Expected: it stays staged and is not in the gps commit.
4. **A foreign file at the top level of `.work/`**, e.g. `.work/notes.md`. Expected: not committed.
5. **A deleted gps file**, e.g. `.work/GLOSSARY.md` deleted after `domain-doc.js` warns about a duplicate. Expected: the deletion is committed.

---

### Task 1: `commitWorkDir` commits only gps's paths

**Files:**
- Modify: `skills/gps/scripts/lib/git.js` (`commitWorkDir`, about lines 198–218, and `module.exports`)
- Test: `tests/lib/git.test.js` (the `commitWorkDir` block, about lines 104–157)

**Interfaces:**
- Produces: `GPS_WORK_PATHS: string[]`, exported from `lib/git.js`, equal to `['.work/gps-config.json', '.work/GLOSSARY.md', '.work/adr', '.work/sessions']`. Task 2 reads it.
- `commitWorkDir(projectRoot, message)` keeps its signature and return shape. `files` lists only paths under `GPS_WORK_PATHS`.

- [ ] **Step 1: Write the failing tests.** Add a new block after the existing `commitWorkDir` block in `tests/lib/git.test.js`. Use a fresh throwaway repo set up like the existing block (`git init -q -b main`, user config, an initial commit of `app.js`). `.gitignore` holds `.work/sessions/.current-session` and is committed with the initial commit.

```js
// commitWorkDir commits only GPS_WORK_PATHS: other skills' files under .work/ stay out.
{
  // ... repo setup as above ...
  assert.deepStrictEqual(GPS_WORK_PATHS, ['.work/gps-config.json', '.work/GLOSSARY.md', '.work/adr', '.work/sessions']);

  // Review Focus 1: sessions/ holds only an ignored file; the config alone is committed.
  fs.mkdirSync(path.join(root, '.work', 'sessions'), { recursive: true });
  fs.writeFileSync(path.join(root, '.work', 'sessions', '.current-session'), 's1');
  fs.writeFileSync(path.join(root, '.work', 'gps-config.json'), '{}\n');
  let record = commitWorkDir(root, 'chore(gps): config');
  assert.ok(record.ok && record.sha, JSON.stringify(record));
  assert.deepStrictEqual(record.files, ['.work/gps-config.json']);

  // Review Focus 3 and 4, plus a foreign skill folder: nothing outside GPS_WORK_PATHS is committed.
  fs.mkdirSync(path.join(root, '.work', 'other-skill'), { recursive: true });
  fs.writeFileSync(path.join(root, '.work', 'other-skill', 'state.md'), 'x\n');
  fs.writeFileSync(path.join(root, '.work', 'notes.md'), 'x\n');
  fs.writeFileSync(path.join(root, '.work', 'other-skill', 'staged.md'), 'x\n');
  sh('git add .work/other-skill/staged.md');
  fs.mkdirSync(path.join(root, '.work', 'sessions', 's1'), { recursive: true });
  fs.writeFileSync(path.join(root, '.work', 'sessions', 's1', 'plan.md'), 'plan\n');
  fs.writeFileSync(path.join(root, '.work', 'GLOSSARY.md'), 'terms\n');
  record = commitWorkDir(root, 'chore(gps): plan s1');
  assert.deepStrictEqual(record.files.sort(), ['.work/GLOSSARY.md', '.work/sessions/s1/plan.md']);
  assert.strictEqual(sh('git diff --cached --name-only'), '.work/other-skill/staged.md', 'a staged foreign file stays staged');
  assert.match(sh('git status --porcelain'), /\?\? \.work\/notes\.md/);
  assert.match(sh('git status --porcelain'), /\?\? \.work\/other-skill\/state\.md/);
  sh('git reset -q');

  // Review Focus 5: deleting a tracked gps file (and a whole session) is committed.
  fs.rmSync(path.join(root, '.work', 'GLOSSARY.md'));
  fs.rmSync(path.join(root, '.work', 'sessions', 's1'), { recursive: true });
  record = commitWorkDir(root, 'chore(gps): clean');
  assert.deepStrictEqual(record.files.sort(), ['.work/GLOSSARY.md', '.work/sessions/s1/plan.md']);
  assert.strictEqual(sh('git ls-files .work/GLOSSARY.md .work/sessions'), '');

  // Review Focus 2: a git-ignored owned path is skipped; the others still commit.
  fs.appendFileSync(path.join(root, '.gitignore'), '.work/adr/\n');
  fs.mkdirSync(path.join(root, '.work', 'adr'), { recursive: true });
  fs.writeFileSync(path.join(root, '.work', 'adr', '0001-x.md'), 'adr\n');
  fs.writeFileSync(path.join(root, '.work', 'gps-config.json'), '{"a":1}\n');
  record = commitWorkDir(root, 'chore(gps): ignored adr');
  assert.ok(record.ok, JSON.stringify(record));
  assert.deepStrictEqual(record.files, ['.work/gps-config.json']);
}
```

Import `GPS_WORK_PATHS` in the existing `require('../../skills/gps/scripts/lib/git')` destructuring. Also update the existing failure assertion (about line 154) so it expects the scoped commands:

```js
assert.match(describeWorkCommit(failed).warning, /not committed \(lint failed\)\. Run by hand: git add -- \.work\/sessions && git commit/);
```

(In that block only `.work/sessions` exists, so it's the only path listed.)

- [ ] **Step 2: Run the tests to check that they fail.**
Run: `node tests/lib/git.test.js`
Expected: FAIL. The `GPS_WORK_PATHS` deepStrictEqual fails, because the constant doesn't exist yet and is `undefined`.

- [ ] **Step 3: Implement it in `lib/git.js`.**
  - Add `const GPS_WORK_PATHS = ['.work/gps-config.json', '.work/GLOSSARY.md', '.work/adr', '.work/sessions'];` above `commitWorkDir`, with a one-line comment pointing at `docs/WORK-DIR.md`. Export it.
  - In `commitWorkDir`, keep the existing early returns (not a repo, no `.work`, `.work/` ignored). Then:
    - **Staging list:** keep each `p` in `GPS_WORK_PATHS` where `isTracked(root, p) || (fs.existsSync(path.join(root, p)) && !isIgnored(root, p))`.
    - **Fallback commands:** `['git add -- ' + paths.join(' '), 'git commit -m <quoted message> -- ' + paths.join(' ')]`, built from the staging list.
    - If the staging list is empty, return `none(null)`.
    - **Staging:** run `git add -A -- ...paths`, then compute `files` with `git diff --cached --name-only -z -- ...paths`, as today.
    - **Commit pathspec:** keep each `p` in the staging list for which some staged file `f` satisfies `f === p || f.startsWith(p + '/')`. Run `git commit -q -m message -- ...commitPaths`.
  - Update the comment above `commitWorkDir` to say it commits `GPS_WORK_PATHS`, not all of `.work/`.

- [ ] **Step 4: Run the tests to check that they pass.**
Run: `node tests/lib/git.test.js`, then `npm test`
Expected: `git.test.js: all assertions passed`, and the whole suite passes. In particular `e2e`, `github-flow`, `finish`, `ticket-complete` and `write-apply` must still pass, since they commit `.work/` through this function.

- [ ] **Step 5: Commit.**
```bash
git add skills/gps/scripts/lib/git.js tests/lib/git.test.js
git commit -m "fix(git): commit only the .work/ paths gps owns"
```

### Task 2: The contract document and its drift guard

**Files:**
- Create: `docs/WORK-DIR.md`
- Modify: `tests/skill.test.js` (append near the decision-0001 checks, about line 130)

**Interfaces:**
- Consumes: `GPS_WORK_PATHS` from `skills/gps/scripts/lib/git.js` (Task 1).

- [ ] **Step 1: Write the failing test** in `tests/skill.test.js`:

```js
// The shared .work/ contract names every path gps owns (docs/WORK-DIR.md).
const { GPS_WORK_PATHS } = require('../skills/gps/scripts/lib/git');
const workDirDoc = fs.readFileSync(path.join(repo, 'docs', 'WORK-DIR.md'), 'utf-8');
for (const p of GPS_WORK_PATHS) assert.ok(workDirDoc.includes(`\`${p}`), `docs/WORK-DIR.md names ${p}`);
```

- [ ] **Step 2: Run the test to check that it fails.**
Run: `node tests/skill.test.js`
Expected: FAIL with ENOENT on `docs/WORK-DIR.md`.

- [ ] **Step 3: Write `docs/WORK-DIR.md`.** Its content is Section 1 of the spec, written for skill authors (second person, short). Use these headings in this order:
  1. `# Sharing .work/ with gps`
  2. `## Paths gps owns`: the spec's table, each path in backticks, starting with the exact strings in `GPS_WORK_PATHS`.
  3. `## Your skill's space`
  4. `## What gps promises`
  5. `## What your skill must do`
  6. `## Outside .work/`

  Under the title, add one line saying that the source of truth for the owned paths is `GPS_WORK_PATHS` in `skills/gps/scripts/lib/git.js`. Mention that a `.work/` git-ignored by an older gps means gps commits nothing; `/gps init --unignore-work` fixes that.

- [ ] **Step 4: Run the tests to check that they pass.**
Run: `node tests/skill.test.js`, then `npm test`
Expected: both pass.

- [ ] **Step 5: Commit.**
```bash
git add docs/WORK-DIR.md tests/skill.test.js
git commit -m "docs: contract for sharing .work/ with other skills"
```

### Task 3: Decision record, links and the 2.5.0 release

**Files:**
- Create: `docs/decisions/0002-gps-commits-only-its-own-work-paths.md`
- Modify: `README.md` (the Layout block at about line 95; the paragraph starting "`.work/` is committed with the code" at about line 151)
- Modify: `.claude/CLAUDE.md` (Layout block; "Session files" paragraph)
- Modify: `CHANGELOG.md`, `package.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`

- [ ] **Step 1: Write decision 0002** in the format of `0001` (title, `_Recorded 2026-10-05, version 2.5.0._`, then Context / Decision / Consequences):
  - **Context:** other skills want to share `.work/`, and `commitWorkDir` swept all of it into `chore(gps)` commits.
  - **Decision:** commit only `GPS_WORK_PATHS`; other skills write in `.work/<skill-name>/` and commit their own files; the contract is in `docs/WORK-DIR.md`.
  - **Rejected alternatives:** documenting the sweep as it was; excluding unknown folders instead of listing the owned ones.
  - **Consequence:** a new gps path must be added to `GPS_WORK_PATHS` and to the doc, and `tests/skill.test.js` enforces the doc half.
- [ ] **Step 2: Update the links.**
  - **`README.md` Layout block:** add the line `docs/WORK-DIR.md           what other skills may do in .work/ (gps owns its sessions and config)`.
  - **`README.md` commit paragraph:** add one sentence: "gps commits only its own paths in `.work/`; other skills can keep files in `.work/<skill-name>/` by following [docs/WORK-DIR.md](docs/WORK-DIR.md)."
  - **`.claude/CLAUDE.md`:** add a Layout line for `docs/WORK-DIR.md`. In the "Session files" paragraph, say that `commitWorkDir` commits `GPS_WORK_PATHS` (not all of `.work/`), and that a new gps path under `.work/` goes in that constant and in `docs/WORK-DIR.md`.
- [ ] **Step 3: Release 2.5.0.**
  - Set `"version": "2.5.0"` in the three manifests.
  - Add a `## 2.5.0` section at the top of `CHANGELOG.md` with two bullets:
    - **Shared `.work/`.** gps commits only its own paths. Other skills keep files in `.work/<skill-name>/` (see `docs/WORK-DIR.md`).
    - **Decision 0002**, linked.
- [ ] **Step 4: Run the full suite.**
Run: `npm test`, then `node tests/check-skill-size.js --max 200`
Expected: all pass. The `skill.test.js` checks that the versions are equal and that the changelog has an entry for the current version.
- [ ] **Step 5: Commit.**
```bash
git add docs/decisions/0002-gps-commits-only-its-own-work-paths.md README.md .claude/CLAUDE.md CHANGELOG.md package.json .claude-plugin/plugin.json .claude-plugin/marketplace.json
git commit -m "docs: decision 0002 and release 2.5.0"
```
