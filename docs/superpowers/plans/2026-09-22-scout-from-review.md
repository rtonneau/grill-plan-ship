# `/gps scout --from` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `/gps scout --from <review-file> [direction]` turn an existing review document into `/gps start` seeds, archived with its original extension and carrying `severity` and `sourcePath`.

**Architecture:** `scripts/lib/scout-ingest.js` learns an optional `sourcePath` (review mode: different archive name, `sourcePath` on seeds) and an optional per-candidate `severity`. `scripts/scout-merge.js` gains a `--from <reviewPath>` form that passes the review as both the report to archive and the `sourcePath`. `skills/gps/SKILL.md` documents how Claude Code reads the review and writes candidates in that mode.

**Tech Stack:** Node.js ≥ 20, standard library only; tests are plain `assert` scripts run by `npm test` (`node --test`).

**Spec:** `docs/superpowers/specs/2026-09-22-scout-from-review-design.md`

## Global Constraints

- No dependencies; Node standard library only.
- Handlers fail through `GpsError` + `runCli`: `❌ message`, optional hint line, exit 1, no stack trace.
- Validation is all-or-nothing: an invalid argument, report or candidate writes nothing.
- Scout mode without `--from` stays byte-for-byte compatible: `architecture-review-<ts>.html`, same hints.
- `severity`: optional; when present a string, non-empty after trim, at most 32 characters.
- Review archive name: `review-<stem>-<ts><ext>`; `<stem>` via `slugify()` (≤ 64 chars), `file` if it cleans to nothing; `<ext>` lowercased original extension, none if none.
- `sourcePath`: project-relative with `/` when inside the project root, absolute otherwise; `null` in scout mode.

## Review Focus

- A review path given relative to the project root while the handler runs from the project root — must resolve and be recorded as the same relative path (Task 1 test: relative input).
- A review whose filename has no letters or digits (e.g. `---.md`) — archive stem `file`, not `untitled-<HHMMSS>` (Task 1 test).
- A dotfile-style review name with no extension (e.g. `.review`) — archived with no extension and stem `review` (Task 1 test).
- `severity: null` written by Claude for a review with no scale — treated as absent, not rejected (Task 1 test).
- `--from` placed after the report path (`report.md --from x`) — rejected with usage, nothing written (Task 2 test).

---

### Task 1: Review-mode ingest and `severity` in `scout-ingest.js`

**Files:**
- Modify: `scripts/lib/scout-ingest.js`
- Test: `scripts/lib/scout-ingest.test.js`

**Interfaces:**
- Produces: `ingestScoutReport({ sessionsDir, reportPath, sourcePath, sourceDirection, candidates, now })` → `{ reportDestPath, sourceReport, seeded: [{ slug, strength, severity, problem, startCommand }], warnings }`. `sourcePath` is `null`/omitted for scout mode, or the review path as the user gave it. The project root is `path.resolve(sessionsDir, '..', '..')`.
- Seed entries gain `severity` (string | null) and `sourcePath` (string | null).

- [ ] **Step 1: Update existing tests for the rename and new fields**

In `scripts/lib/scout-ingest.test.js`, rename every `tempReportPath:` property passed to `ingestScoutReport` to `reportPath: tempReportPath` / `reportPath: otherReportPath` / `reportPath: path.join(os.tmpdir(), 'does-not-exist.html')`, and the two shorthand uses (`{ sessionsDir, tempReportPath, … }`) to `reportPath: tempReportPath`. Add `severity: null` to both expected `seeded` items, and after the `createdAt` assertion add:

```js
assert.strictEqual(seed.severity, null);
assert.strictEqual(seed.sourcePath, null);
```

- [ ] **Step 2: Append review-mode and severity tests before the cleanup lines**

```js
// ---------------------------------------------------------------- --from (review mode)

{
  // realpath: on macOS os.tmpdir() is a symlink, and process.cwd() after chdir reports the real path
  const projectRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gps-scout-review-')));
  const reviewSessionsDir = path.join(projectRoot, '.work', 'sessions');
  const reviewsDir = path.join(projectRoot, 'docs', 'reviews');
  fs.mkdirSync(reviewsDir, { recursive: true });
  const reviewPath = path.join(reviewsDir, 'Dotfiles Review.MD');
  const reviewBytes = Buffer.from('# Review\r\n\r\nC1 é\n');
  fs.writeFileSync(reviewPath, reviewBytes);
  const reviewNow = new Date('2026-09-22T10:00:00.000Z');

  const review = ingestScoutReport({
    sessionsDir: reviewSessionsDir,
    reportPath: reviewPath,
    sourcePath: reviewPath,
    sourceDirection: null,
    candidates: [
      { slug: 'safe-bootstrap-linking', strength: 'Strong', severity: 'Critical', problem: 'C1, H1: p', solution: 's' },
      { slug: 'no-scale', strength: 'Speculative', severity: null, problem: 'p', solution: 's' },
    ],
    now: reviewNow,
  });

  // Archived with its own (lowercased) extension and a cleaned stem, byte-for-byte
  assert.strictEqual(review.sourceReport, 'scout-reports/review-dotfiles-review-2026-09-22T10-00-00-000Z.md');
  assert.deepStrictEqual(fs.readFileSync(review.reportDestPath), reviewBytes);

  // Seeds carry severity and a project-relative, forward-slash sourcePath
  const reviewSeed = getSeed(reviewSessionsDir, 'safe-bootstrap-linking');
  assert.strictEqual(reviewSeed.severity, 'Critical');
  assert.strictEqual(reviewSeed.sourcePath, 'docs/reviews/Dotfiles Review.MD');
  assert.strictEqual(reviewSeed.sourceReport, review.sourceReport);
  assert.strictEqual(getSeed(reviewSessionsDir, 'no-scale').severity, null);
  assert.deepStrictEqual(review.seeded.map((s) => s.severity), ['Critical', null]);

  // Same timestamp again -> -2 suffix, extension kept
  const again = ingestScoutReport({
    sessionsDir: reviewSessionsDir,
    reportPath: reviewPath,
    sourcePath: reviewPath,
    sourceDirection: null,
    candidates: [{ slug: 'again', strength: 'Strong', problem: 'p', solution: 's' }],
    now: reviewNow,
  });
  assert.strictEqual(again.sourceReport, 'scout-reports/review-dotfiles-review-2026-09-22T10-00-00-000Z-2.md');

  // A relative path (as the handler receives it, resolved from the project root) stays relative
  const cwdBefore = process.cwd();
  process.chdir(projectRoot);
  try {
    ingestScoutReport({
      sessionsDir: reviewSessionsDir,
      reportPath: 'docs/reviews/Dotfiles Review.MD',
      sourcePath: 'docs/reviews/Dotfiles Review.MD',
      sourceDirection: null,
      candidates: [{ slug: 'relative-input', strength: 'Strong', problem: 'p', solution: 's' }],
      now: new Date('2026-09-22T10:05:00.000Z'),
    });
  } finally {
    process.chdir(cwdBefore);
  }
  assert.strictEqual(getSeed(reviewSessionsDir, 'relative-input').sourcePath, 'docs/reviews/Dotfiles Review.MD');

  // A file outside the project is recorded by absolute path
  const outside = path.join(os.tmpdir(), `outside-review-${Date.now()}.txt`);
  fs.writeFileSync(outside, 'x');
  ingestScoutReport({
    sessionsDir: reviewSessionsDir,
    reportPath: outside,
    sourcePath: outside,
    sourceDirection: null,
    candidates: [{ slug: 'outside', strength: 'Strong', problem: 'p', solution: 's' }],
    now: new Date('2026-09-22T10:10:00.000Z'),
  });
  assert.strictEqual(getSeed(reviewSessionsDir, 'outside').sourcePath, path.resolve(outside));
  fs.rmSync(outside, { force: true });

  // No extension stays none; a name with no letters/digits becomes "file"
  const dotfile = path.join(reviewsDir, '.review');
  fs.writeFileSync(dotfile, 'x');
  const dotResult = ingestScoutReport({
    sessionsDir: reviewSessionsDir, reportPath: dotfile, sourcePath: dotfile, sourceDirection: null,
    candidates: [{ slug: 'dotfile', strength: 'Strong', problem: 'p', solution: 's' }],
    now: new Date('2026-09-22T10:15:00.000Z'),
  });
  assert.strictEqual(dotResult.sourceReport, 'scout-reports/review-review-2026-09-22T10-15-00-000Z');
  const symbols = path.join(reviewsDir, '---.md');
  fs.writeFileSync(symbols, 'x');
  const symResult = ingestScoutReport({
    sessionsDir: reviewSessionsDir, reportPath: symbols, sourcePath: symbols, sourceDirection: null,
    candidates: [{ slug: 'symbols', strength: 'Strong', problem: 'p', solution: 's' }],
    now: new Date('2026-09-22T10:20:00.000Z'),
  });
  assert.strictEqual(symResult.sourceReport, 'scout-reports/review-file-2026-09-22T10-20-00-000Z.md');

  // A long stem is cut to 64 characters
  const longName = path.join(reviewsDir, `${'a'.repeat(80)}.md`);
  fs.writeFileSync(longName, 'x');
  const longResult = ingestScoutReport({
    sessionsDir: reviewSessionsDir, reportPath: longName, sourcePath: longName, sourceDirection: null,
    candidates: [{ slug: 'long', strength: 'Strong', problem: 'p', solution: 's' }],
    now: new Date('2026-09-22T10:25:00.000Z'),
  });
  assert.strictEqual(longResult.sourceReport, `scout-reports/review-${'a'.repeat(64)}-2026-09-22T10-25-00-000Z.md`);

  // Invalid severity -> throws naming the slug, nothing written
  const reportsBeforeSeverity = fs.readdirSync(path.join(reviewSessionsDir, 'scout-reports')).length;
  const seedsBeforeSeverity = fs.readFileSync(path.join(reviewSessionsDir, '.pending-seeds.json'), 'utf-8');
  for (const severity of ['', '   ', 'x'.repeat(33), 3]) {
    assert.throws(() => ingestScoutReport({
      sessionsDir: reviewSessionsDir, reportPath: reviewPath, sourcePath: reviewPath, sourceDirection: null,
      candidates: [{ slug: 'bad-severity', strength: 'Strong', severity, problem: 'p', solution: 's' }],
      now: new Date('2026-09-22T11:00:00.000Z'),
    }), /Invalid severity for "bad-severity"/, `accepted severity ${JSON.stringify(severity)}`);
  }
  assert.strictEqual(fs.readdirSync(path.join(reviewSessionsDir, 'scout-reports')).length, reportsBeforeSeverity);
  assert.strictEqual(fs.readFileSync(path.join(reviewSessionsDir, '.pending-seeds.json'), 'utf-8'), seedsBeforeSeverity);
  // Exactly 32 characters is fine
  ingestScoutReport({
    sessionsDir: reviewSessionsDir, reportPath: reviewPath, sourcePath: reviewPath, sourceDirection: null,
    candidates: [{ slug: 'max-severity', strength: 'Strong', severity: 'x'.repeat(32), problem: 'p', solution: 's' }],
    now: new Date('2026-09-22T11:05:00.000Z'),
  });

  // Missing review / a directory -> review-mode wording, nothing written
  assert.throws(() => ingestScoutReport({
    sessionsDir: reviewSessionsDir, reportPath: path.join(reviewsDir, 'nope.md'), sourcePath: path.join(reviewsDir, 'nope.md'),
    sourceDirection: null, candidates: [{ slug: 'x', strength: 'Strong', problem: 'p', solution: 's' }],
  }), /Review file not found/);
  assert.throws(() => ingestScoutReport({
    sessionsDir: reviewSessionsDir, reportPath: reviewsDir, sourcePath: reviewsDir,
    sourceDirection: null, candidates: [{ slug: 'x', strength: 'Strong', problem: 'p', solution: 's' }],
  }), /Not a file/);
  // Scout mode keeps its own wording for a missing report
  assert.throws(() => ingestScoutReport({
    sessionsDir: reviewSessionsDir, reportPath: path.join(os.tmpdir(), 'does-not-exist.html'),
    sourceDirection: null, candidates: [{ slug: 'x', strength: 'Strong', problem: 'p', solution: 's' }],
  }), /Report file not found/);

  fs.rmSync(projectRoot, { recursive: true, force: true });
}
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node scripts/lib/scout-ingest.test.js`
Expected: FAIL (`Report file not found: undefined` from the renamed `reportPath`, or an `AssertionError` on `severity`).

- [ ] **Step 4: Implement in `scripts/lib/scout-ingest.js`**

Change the import to `const { GpsError, isSlug, slugify, MAX_SLUG_LENGTH } = require('./guard');` and add after `REQUIRED_TEXT_FIELDS`:

```js
const MAX_SEVERITY_LENGTH = 32;
```

In `validateCandidates`, after the `files` check:

```js
    if (candidate.severity !== undefined && candidate.severity !== null
      && (typeof candidate.severity !== 'string' || !candidate.severity.trim()
        || candidate.severity.length > MAX_SEVERITY_LENGTH)) {
      throw new GpsError(`Invalid severity for "${candidate.slug}": ${JSON.stringify(candidate.severity)}`,
        `Severity is optional; when given it must be a non-empty string of at most ${MAX_SEVERITY_LENGTH} characters.`);
    }
```

Replace `copyReportWriteOnce` so it takes the extension:

```js
// Copies the report without ever overwriting: on a name collision,
// tries -2, -3, ... suffixes.
function copyReportWriteOnce(reportPath, reportsDir, baseName, ext) {
  for (let n = 1; n < 1000; n++) {
    const fileName = n === 1 ? `${baseName}${ext}` : `${baseName}-${n}${ext}`;
    const destPath = path.join(reportsDir, fileName);
    try {
      fs.copyFileSync(reportPath, destPath, fs.constants.COPYFILE_EXCL);
      return { fileName, destPath };
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
  }
  throw new GpsError(`Could not find a free report filename for ${baseName}.`);
}

// Throws unless reportPath is an existing regular file, with wording for
// the mode: a scout temp report, or a review the user pointed --from at.
function checkReportFile(reportPath, isReview) {
  const hint = isReview
    ? 'Check the path; a relative path is resolved from the project root.'
    : 'The architecture-review step must write its HTML report before scout-merge.js runs.';
  let stat = null;
  try {
    stat = fs.statSync(reportPath);
  } catch (_err) {
    // missing or unreadable: reported below
  }
  if (!stat) throw new GpsError(`${isReview ? 'Review' : 'Report'} file not found: ${reportPath}`, hint);
  if (!stat.isFile()) throw new GpsError(`Not a file: ${reportPath}`, hint);
}

// Archive name for a --from review: review-<stem>-<ts><ext>, keeping the
// original extension (lowercased). A stem with no letters or digits
// becomes "file" rather than slugify's untitled-<time> fallback.
function reviewArchiveName(sourcePath, timestamp) {
  const originalExt = path.extname(sourcePath);
  const rawStem = path.basename(sourcePath, originalExt);
  const hasText = /[a-z0-9]/.test(rawStem.normalize('NFKD').toLowerCase());
  const stem = hasText ? slugify(rawStem).slice(0, MAX_SLUG_LENGTH) : 'file';
  return { baseName: `review-${stem}-${timestamp}`, ext: originalExt.toLowerCase() };
}

// Project-relative with "/" when the file is inside projectRoot,
// otherwise absolute.
function recordedSourcePath(sourcePath, projectRoot) {
  const absolute = path.resolve(sourcePath);
  const relative = path.relative(projectRoot, absolute);
  if (relative && relative.split(path.sep)[0] !== '..' && !path.isAbsolute(relative)) {
    return relative.split(path.sep).join('/');
  }
  return absolute;
}
```

Replace `ingestScoutReport` with:

```js
function ingestScoutReport({ sessionsDir, reportPath, sourcePath, sourceDirection, candidates, now }) {
  const isReview = Boolean(sourcePath);
  checkReportFile(reportPath, isReview);
  const { accepted, warnings } = validateCandidates(candidates);

  const effectiveNow = now || new Date();
  const reportsDir = path.join(sessionsDir, 'scout-reports');
  fs.mkdirSync(reportsDir, { recursive: true });

  const timestamp = effectiveNow.toISOString().replace(/[:.]/g, '-');
  const { baseName, ext } = isReview
    ? reviewArchiveName(sourcePath, timestamp)
    : { baseName: `architecture-review-${timestamp}`, ext: '.html' };
  const { fileName: reportFilename, destPath: reportDestPath } =
    copyReportWriteOnce(reportPath, reportsDir, baseName, ext);

  const sourceReport = ['scout-reports', reportFilename].join('/');
  const createdAt = effectiveNow.toISOString();
  const projectRoot = path.resolve(sessionsDir, '..', '..');
  const recordedSource = isReview ? recordedSourcePath(sourcePath, projectRoot) : null;

  const newEntries = {};
  for (const candidate of accepted) {
    const { slug, strength, severity, files, problem, solution, benefits } = candidate;
    newEntries[slug] = {
      strength,
      severity: severity || null,
      files: files || [],
      problem,
      solution,
      benefits: benefits || null,
      sourceDirection: sourceDirection || null,
      sourceReport,
      sourcePath: recordedSource,
      createdAt,
    };
  }

  mergeSeeds(sessionsDir, newEntries);

  const seeded = Object.entries(newEntries).map(([slug, entry]) => ({
    slug,
    strength: entry.strength,
    severity: entry.severity,
    problem: entry.problem,
    startCommand: `/gps start ${slug}`,
  }));

  return { reportDestPath, sourceReport, seeded, warnings };
}
```

Export `MAX_SEVERITY_LENGTH` alongside `STRENGTHS`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node scripts/lib/scout-ingest.test.js`
Expected: `scout-ingest.test.js: all assertions passed`

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/scout-ingest.js scripts/lib/scout-ingest.test.js
git commit -m "feat(scout): archive --from reviews with their extension, add severity and sourcePath to seeds"
```

---

### Task 2: `--from` in `scripts/scout-merge.js`

**Files:**
- Modify: `scripts/scout-merge.js`
- Test: `scripts/handlers.test.js`, `scripts/e2e.test.js`

**Interfaces:**
- Consumes: `ingestScoutReport({ sessionsDir, reportPath, sourcePath, sourceDirection, candidates })` from Task 1.
- Produces: CLI `node scout-merge.js <tempReportPath> <entriesJsonPath>` and `node scout-merge.js --from <reviewPath> <entriesJsonPath>`; stdout is the JSON result from Task 1.

- [ ] **Step 1: Add handler tests** — in `scripts/handlers.test.js`, after the existing scout block:

```js
{
  // --from: review archived with its extension, seeds carry severity + sourcePath
  const root = tempProject();
  fs.mkdirSync(path.join(root, 'docs'));
  fs.writeFileSync(path.join(root, 'docs', 'review.md'), '# Review\n');
  const entries = path.join(root, 'entries.json');
  fs.writeFileSync(entries, JSON.stringify({
    sourceDirection: 'only Critical and High',
    candidates: [{ slug: 'safe-linking', strength: 'Strong', severity: 'Critical', problem: 'C1: p', solution: 's' }],
  }));
  const seedsFile = path.join(sessionsDir(root), '.pending-seeds.json');
  const reportsDir = path.join(sessionsDir(root), 'scout-reports');

  // Usage errors write nothing
  for (const args of [
    ['--from'],
    ['--from', 'docs/review.md'],
    ['--bogus', 'docs/review.md', entries],
    ['docs/review.md', '--from', entries],
    ['--from', 'docs/review.md', entries, 'extra'],
  ]) {
    const res = run(root, 'scout-merge.js', ...args);
    assert.strictEqual(res.code, 1, args.join(' '));
    assert.match(res.err, /Usage: node scout-merge\.js/, args.join(' '));
    assert.doesNotMatch(res.err, /\n\s+at /);
  }
  // Missing review / a directory -> clear error, nothing written
  const missing = run(root, 'scout-merge.js', '--from', 'docs/nope.md', entries);
  assert.strictEqual(missing.code, 1);
  assert.match(missing.err, /Review file not found: docs\/nope\.md/);
  const dir = run(root, 'scout-merge.js', '--from', 'docs', entries);
  assert.strictEqual(dir.code, 1);
  assert.match(dir.err, /Not a file: docs/);
  assert.ok(!fs.existsSync(seedsFile));
  assert.ok(!fs.existsSync(reportsDir));

  const res = run(root, 'scout-merge.js', '--from', 'docs/review.md', entries);
  assert.strictEqual(res.code, 0, res.err);
  const summary = JSON.parse(res.out);
  assert.match(summary.sourceReport, /^scout-reports\/review-review-.+\.md$/);
  assert.deepStrictEqual(summary.seeded.map((s) => s.severity), ['Critical']);
  const seeds = JSON.parse(fs.readFileSync(seedsFile, 'utf-8'));
  assert.strictEqual(seeds['safe-linking'].sourcePath, 'docs/review.md');
  assert.strictEqual(seeds['safe-linking'].sourceDirection, 'only Critical and High');
  assert.strictEqual(fs.readFileSync(path.join(sessionsDir(root), summary.sourceReport), 'utf-8'), '# Review\n');
}
```

- [ ] **Step 2: Add the e2e step** — in `scripts/e2e.test.js`, before the final `fs.rmSync(root, …)`:

```js
// scout --from -> start: the seed is consumed and printed with severity + sourcePath
fs.mkdirSync(path.join(root, 'docs'));
fs.writeFileSync(path.join(root, 'docs', 'review.md'), '# Review\n\nC1: links delete config.\n');
const scoutEntries = path.join(root, 'scout-entries.json');
fs.writeFileSync(scoutEntries, JSON.stringify({
  sourceDirection: null,
  candidates: [{ slug: 'safe-linking', strength: 'Strong', severity: 'Critical', problem: 'C1: p', solution: 's' }],
}));
ok('scout-merge.js', '--from', 'docs/review.md', scoutEntries);
const seededStart = ok('start-session.js', 'safe-linking');
assert.match(seededStart.out, /Scout seed found for "safe-linking"/);
assert.match(seededStart.out, /"severity": "Critical"/);
assert.match(seededStart.out, /"sourcePath": "docs\/review\.md"/);
const seedsLeft = JSON.parse(fs.readFileSync(path.join(root, '.work', 'sessions', '.pending-seeds.json'), 'utf-8'));
assert.ok(!('safe-linking' in seedsLeft));
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node scripts/handlers.test.js` and `node scripts/e2e.test.js`
Expected: FAIL — `--from` is read as the report path (`Report file not found: --from` or wrong exit code).

- [ ] **Step 4: Implement `scripts/scout-merge.js`**

Update the header comment's Usage to list both forms, then replace the body with:

```js
const path = require('path');
const { ingestScoutReport } = require('./lib/scout-ingest');
const { GpsError, readJson, runCli } = require('./lib/guard');

const USAGE = 'Usage: node scout-merge.js <tempReportPath> <entriesJsonPath> | --from <reviewPath> <entriesJsonPath>';

// --from may only come first; any other "--" argument is an unknown option.
function parseArgs(argv) {
  const fromReview = argv[0] === '--from';
  const args = fromReview ? argv.slice(1) : argv;
  const flag = args.find((arg) => arg.startsWith('--'));
  if (flag) throw new GpsError(`Unknown option: ${flag}`, USAGE);
  if (fromReview && args.length === 0) throw new GpsError('--from needs a review file path.', USAGE);
  if (args.length < 2) throw new GpsError('Missing arguments.', USAGE);
  if (args.length > 2) throw new GpsError('Too many arguments.', USAGE);
  const [reportPath, entriesJsonPath] = args;
  return { reportPath, entriesJsonPath, sourcePath: fromReview ? reportPath : null };
}

runCli(() => {
  const { reportPath, entriesJsonPath, sourcePath } = parseArgs(process.argv.slice(2));

  const input = readJson(entriesJsonPath, 'Scout entries file');
  const sessionsDir = path.join(process.cwd(), '.work', 'sessions');

  const result = ingestScoutReport({
    sessionsDir,
    reportPath,
    sourcePath,
    sourceDirection: input.sourceDirection || null,
    candidates: input.candidates,
  });

  for (const warning of result.warnings) console.error(`⚠️  ${warning}`);
  console.log(JSON.stringify(result, null, 2));
});
```


- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: all test files pass.

- [ ] **Step 6: Commit**

```bash
git add scripts/scout-merge.js scripts/handlers.test.js scripts/e2e.test.js
git commit -m "feat(scout): add --from <review> to scout-merge.js"
```

---

### Task 3: Document `/gps scout --from`

**Files:**
- Modify: `skills/gps/SKILL.md`, `README.md`, `docs/TUTORIAL.md`

- [ ] **Step 1: SKILL.md**
  - Frontmatter description: `Use for /gps scout, /gps scout --from, /gps start, …`.
  - Commands list: `/gps scout [--from <review-file>] [direction]` — scan the codebase, or read an existing review, and turn the result into `/gps start` seeds.
  - Overview paragraph on scout: mention `--from` sources candidates from an existing review document.
  - Dependencies: "Architecture review — invoked by `/gps scout` (not by `/gps scout --from`)".
  - `/gps scout` section: add a "With `--from <review-file>`" subsection covering: no skill invoked; read the file (stop if unreadable); candidate rules (group by default, follow the review's plan, `[direction]` may ask for one per finding or filter; `problem` starts with finding IDs; `severity` = highest severity in the review's own words, omitted if no scale; `strength` from the review's certainty; `files` from paths named; open decisions go into the affected seed); write the entries JSON; run `node $CLAUDE_PLUGIN_ROOT/scripts/scout-merge.js --from <review-file> <entriesJsonPath>`; archive name `review-<stem>-<timestamp><ext>`; summary with `severity · strength` badges.
  - Seed field list in step 3 of scout: add optional `severity`.
  - Composable Skills list: note scout's review skill is skipped with `--from`.
- [ ] **Step 2: README.md** — add `/gps scout [--from <review>]` to the command list and a short "Start from an existing review" subsection after Quick Start.
- [ ] **Step 3: TUTORIAL.md** — add "Example 4: Turning an existing review into sessions" after Example 3 (renumber the later example to 5).
- [ ] **Step 4: Verify** — `npm test` still passes; `grep -n "scout" skills/gps/SKILL.md README.md docs/TUTORIAL.md` shows `--from` in each.
- [ ] **Step 5: Commit**

```bash
git add skills/gps/SKILL.md README.md docs/TUTORIAL.md
git commit -m "docs: document /gps scout --from"
```
