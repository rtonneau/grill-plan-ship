// scripts/lib/scout-ingest.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ingestScoutReport } = require('./scout-ingest');
const { getSeed } = require('./seeds-store');

const sessionsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-scout-ingest-'));
const tempReportPath = path.join(os.tmpdir(), `scout-ingest-test-report-${Date.now()}.html`);
fs.writeFileSync(tempReportPath, '<html><body>fake report</body></html>');

const candidates = [
  { slug: 'runconfig-resolver', strength: 'Strong', files: ['sim.cc'], problem: 'p1', solution: 's1', benefits: 'b1' },
  { slug: 'threads-arg-validation', strength: 'Strong', files: ['sim.cc'], problem: 'p2', solution: 's2' },
];

const now1 = new Date('2026-09-17T14:23:01.000Z');
const result1 = ingestScoutReport({
  sessionsDir,
  reportPath: tempReportPath,
  sourceDirection: 'only review sim.cc',
  candidates,
  now: now1,
});

// Report copied verbatim under scout-reports/, named from the timestamp
assert.strictEqual(result1.sourceReport, 'scout-reports/architecture-review-2026-09-17T14-23-01-000Z.html');
assert.ok(fs.existsSync(result1.reportDestPath));
assert.strictEqual(
  fs.readFileSync(result1.reportDestPath, 'utf-8'),
  '<html><body>fake report</body></html>'
);

// Seed summary returned for chat presentation
assert.deepStrictEqual(result1.seeded, [
  { slug: 'runconfig-resolver', strength: 'Strong', severity: null, problem: 'p1', startCommand: '/gps start runconfig-resolver' },
  { slug: 'threads-arg-validation', strength: 'Strong', severity: null, problem: 'p2', startCommand: '/gps start threads-arg-validation' },
]);

// Seeds actually merged into .pending-seeds.json, with sourceReport/sourceDirection/createdAt attached
const seed = getSeed(sessionsDir, 'runconfig-resolver');
assert.strictEqual(seed.strength, 'Strong');
assert.deepStrictEqual(seed.files, ['sim.cc']);
assert.strictEqual(seed.problem, 'p1');
assert.strictEqual(seed.benefits, 'b1');
assert.strictEqual(seed.sourceDirection, 'only review sim.cc');
assert.strictEqual(seed.sourceReport, 'scout-reports/architecture-review-2026-09-17T14-23-01-000Z.html');
assert.strictEqual(seed.createdAt, '2026-09-17T14:23:01.000Z');
assert.strictEqual(seed.severity, null);
assert.strictEqual(seed.sourcePath, null);

// A candidate with no benefits defaults to null, not undefined
assert.strictEqual(getSeed(sessionsDir, 'threads-arg-validation').benefits, null);

// A second scout run at a different timestamp writes a second, separate report file;
// the first report is untouched (write-once)
const now2 = new Date('2026-09-17T15:00:00.000Z');
ingestScoutReport({
  sessionsDir,
  reportPath: tempReportPath,
  sourceDirection: 'gui vs batch seam',
  candidates: [{ slug: 'gui-batch-seam', strength: 'Worth exploring', problem: 'p3', solution: 's3' }],
  now: now2,
});
assert.ok(fs.existsSync(result1.reportDestPath));
assert.strictEqual(
  fs.readFileSync(result1.reportDestPath, 'utf-8'),
  '<html><body>fake report</body></html>'
);
assert.strictEqual(getSeed(sessionsDir, 'runconfig-resolver').sourceReport, result1.sourceReport);

// Ingesting again at the exact same timestamp writes a suffixed copy
// instead of overwriting the existing report (immutability guarantee)
const otherReportPath = path.join(os.tmpdir(), `scout-ingest-test-report-b-${Date.now()}.html`);
fs.writeFileSync(otherReportPath, '<html>second</html>');
const collision = ingestScoutReport({
  sessionsDir,
  reportPath: otherReportPath,
  sourceDirection: null,
  candidates: [{ slug: 'duplicate-timestamp', strength: 'Speculative', problem: 'p4', solution: 's4' }],
  now: now1,
});
assert.strictEqual(collision.sourceReport, 'scout-reports/architecture-review-2026-09-17T14-23-01-000Z-2.html');
assert.strictEqual(fs.readFileSync(collision.reportDestPath, 'utf-8'), '<html>second</html>');
// The collision must not have mutated the original report file
assert.strictEqual(
  fs.readFileSync(result1.reportDestPath, 'utf-8'),
  '<html><body>fake report</body></html>'
);
fs.rmSync(otherReportPath, { force: true });

// Duplicate slugs in one run: first kept, warning returned
const dup = ingestScoutReport({
  sessionsDir,
  reportPath: tempReportPath,
  sourceDirection: null,
  candidates: [
    { slug: 'dup-slug', strength: 'Strong', problem: 'first', solution: 's' },
    { slug: 'dup-slug', strength: 'Strong', problem: 'second', solution: 's' },
  ],
  now: new Date('2026-09-17T17:00:00.000Z'),
});
assert.strictEqual(dup.seeded.length, 1);
assert.strictEqual(getSeed(sessionsDir, 'dup-slug').problem, 'first');
assert.strictEqual(dup.warnings.length, 1);
assert.match(dup.warnings[0], /Duplicate slug "dup-slug"/);

// Invalid candidates are rejected before any file is written
const reportsBefore = fs.readdirSync(path.join(sessionsDir, 'scout-reports')).length;
const seedsBefore = fs.readFileSync(path.join(sessionsDir, '.pending-seeds.json'), 'utf-8');
for (const bad of [
  { slug: 'no-strength', problem: 'p', solution: 's' },
  { slug: 'bad-strength', strength: 'Huge', problem: 'p', solution: 's' },
  { slug: 'no-problem', strength: 'Strong', solution: 's' },
  { slug: 'no-solution', strength: 'Strong', problem: 'p' },
  { slug: 'bad-files', strength: 'Strong', problem: 'p', solution: 's', files: 'sim.cc' },
  { slug: '../escape', strength: 'Strong', problem: 'p', solution: 's' },
]) {
  assert.throws(() => ingestScoutReport({
    sessionsDir,
    reportPath: tempReportPath,
    sourceDirection: null,
    candidates: [{ slug: 'valid-one', strength: 'Strong', problem: 'p', solution: 's' }, bad],
    now: new Date('2026-09-17T18:00:00.000Z'),
  }), `accepted ${JSON.stringify(bad)}`);
}
assert.strictEqual(fs.readdirSync(path.join(sessionsDir, 'scout-reports')).length, reportsBefore);
assert.strictEqual(fs.readFileSync(path.join(sessionsDir, '.pending-seeds.json'), 'utf-8'), seedsBefore);

// Missing report file -> throws before touching anything
assert.throws(() => {
  ingestScoutReport({
    sessionsDir,
    reportPath: path.join(os.tmpdir(), 'does-not-exist.html'),
    sourceDirection: null,
    candidates: [{ slug: 'x', strength: 'Strong', problem: 'p', solution: 's' }],
  });
});

// No candidates -> throws
assert.throws(() => {
  ingestScoutReport({ sessionsDir, reportPath: tempReportPath, sourceDirection: null, candidates: [] });
});

// Invalid slug (uppercase / spaces) -> throws, no partial write
assert.throws(() => {
  ingestScoutReport({
    sessionsDir,
    reportPath: tempReportPath,
    sourceDirection: null,
    candidates: [{ slug: 'Not A Slug', strength: 'Strong', problem: 'p', solution: 's' }],
    now: new Date('2026-09-17T16:00:00.000Z'),
  });
});
assert.strictEqual(getSeed(sessionsDir, 'Not A Slug'), null);

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

fs.rmSync(sessionsDir, { recursive: true, force: true });
fs.rmSync(tempReportPath, { force: true });
console.log('scout-ingest.test.js: all assertions passed');
