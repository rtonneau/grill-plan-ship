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
  tempReportPath,
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
  { slug: 'runconfig-resolver', strength: 'Strong', problem: 'p1', startCommand: '/gps start runconfig-resolver' },
  { slug: 'threads-arg-validation', strength: 'Strong', problem: 'p2', startCommand: '/gps start threads-arg-validation' },
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

// A candidate with no benefits defaults to null, not undefined
assert.strictEqual(getSeed(sessionsDir, 'threads-arg-validation').benefits, null);

// A second scout run at a different timestamp writes a second, separate report file;
// the first report is untouched (write-once)
const now2 = new Date('2026-09-17T15:00:00.000Z');
ingestScoutReport({
  sessionsDir,
  tempReportPath,
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
  tempReportPath: otherReportPath,
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
  tempReportPath,
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
    tempReportPath,
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
    tempReportPath: path.join(os.tmpdir(), 'does-not-exist.html'),
    sourceDirection: null,
    candidates: [{ slug: 'x', strength: 'Strong', problem: 'p', solution: 's' }],
  });
});

// No candidates -> throws
assert.throws(() => {
  ingestScoutReport({ sessionsDir, tempReportPath, sourceDirection: null, candidates: [] });
});

// Invalid slug (uppercase / spaces) -> throws, no partial write
assert.throws(() => {
  ingestScoutReport({
    sessionsDir,
    tempReportPath,
    sourceDirection: null,
    candidates: [{ slug: 'Not A Slug', strength: 'Strong', problem: 'p', solution: 's' }],
    now: new Date('2026-09-17T16:00:00.000Z'),
  });
});
assert.strictEqual(getSeed(sessionsDir, 'Not A Slug'), null);

fs.rmSync(sessionsDir, { recursive: true, force: true });
fs.rmSync(tempReportPath, { force: true });
console.log('scout-ingest.test.js: all assertions passed');
