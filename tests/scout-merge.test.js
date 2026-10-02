// tests/scout-merge.test.js — scout-merge.js (/gps scout [--from]). Validation: tests/lib/scout-ingest.test.js.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const h = require('./helpers');

{
  const root = h.tempProject();
  const report = path.join(root, 'report.html');
  fs.writeFileSync(report, '<html>r</html>');
  const entries = path.join(root, 'entries.json');
  const seedsFile = path.join(h.sessionsDir(root), '.pending-seeds.json');

  // Usage errors: exit 2.
  h.assertFails(h.run(root, 'scout-merge.js'), 2, /Usage: scout-merge\.js/);
  h.assertFails(h.run(root, 'scout-merge.js', [report]), 2, /Give the report and the entries file/);
  h.assertFails(h.run(root, 'scout-merge.js', ['--bogus', report, entries]), 2, /Unknown option: --bogus/);
  h.assertFails(h.run(root, 'scout-merge.js', [report, entries, 'extra']), 2);

  // Bad JSON -> clear error.
  fs.writeFileSync(entries, '{');
  h.assertFails(h.run(root, 'scout-merge.js', [report, entries]), 1, /not valid JSON/);

  // A corrupt seeds file is kept aside; a repeated slug keeps its first occurrence.
  fs.mkdirSync(h.sessionsDir(root), { recursive: true });
  fs.writeFileSync(seedsFile, '{bad');
  fs.writeFileSync(entries, JSON.stringify({
    candidates: [
      { slug: 'a-b', strength: 'Strong', problem: 'p\nmore', solution: 's' },
      { slug: 'a-b', strength: 'Strong', problem: 'p2', solution: 's' },
    ],
  }));
  const res = h.ok(root, 'scout-merge.js', [report, entries]);
  assert.match(res.err, /moved to \.pending-seeds\.json\.corrupt-/);
  assert.match(res.err, /⚠️ {2}Duplicate slug "a-b"/);
  assert.match(res.out, /✅ Seeded 1 idea\(s\); report archived as \.work\/sessions\/scout-reports\/architecture-review-/);
  assert.match(res.out, /- `\/gps start a-b` — Strong — p\n/);
  assert.match(res.out, /Next: \/gps start <slug>/);
  const quarantined = fs.readdirSync(h.sessionsDir(root)).find((f) => f.includes('.corrupt-'));
  assert.strictEqual(fs.readFileSync(path.join(h.sessionsDir(root), quarantined), 'utf-8'), '{bad');

  // An invalid candidate fails the whole run.
  fs.writeFileSync(entries, JSON.stringify({ candidates: [{ slug: 'only-slug' }] }));
  h.assertFails(h.run(root, 'scout-merge.js', [report, entries]), 1, /Invalid strength/);

  // The seed is consumed by /gps start; the archived report is untouched.
  const reportsDir = path.join(h.sessionsDir(root), 'scout-reports');
  const reportCopy = path.join(reportsDir, fs.readdirSync(reportsDir)[0]);
  assert.match(h.ok(root, 'start.js', ['a-b']).out, /Scout seed for "a-b"/);
  assert.doesNotMatch(fs.readFileSync(seedsFile, 'utf-8'), /"a-b"/);
  assert.strictEqual(fs.readFileSync(reportCopy, 'utf-8'), '<html>r</html>');
}

{
  // --from: the review is archived with its extension; seeds carry severity + sourcePath.
  const root = h.tempProject();
  fs.mkdirSync(path.join(root, 'docs'));
  fs.writeFileSync(path.join(root, 'docs', 'review.md'), '# Review\n');
  const entries = path.join(root, 'entries.json');
  fs.writeFileSync(entries, JSON.stringify({
    sourceDirection: 'only Critical and High',
    candidates: [{ slug: 'safe-linking', strength: 'Strong', severity: 'Critical', problem: 'C1: p', solution: 's' }],
  }));
  const seedsFile = path.join(h.sessionsDir(root), '.pending-seeds.json');
  const reportsDir = path.join(h.sessionsDir(root), 'scout-reports');

  h.assertFails(h.run(root, 'scout-merge.js', ['--from']), 2, /--from needs a value/);
  h.assertFails(h.run(root, 'scout-merge.js', ['--from', 'docs/review.md']), 2, /Missing arguments/);
  h.assertFails(h.run(root, 'scout-merge.js', ['--from', 'docs/review.md', entries, 'extra']), 2, /only the entries file/);
  h.assertFails(h.run(root, 'scout-merge.js', ['--from', 'docs/nope.md', entries]), 1, /Review file not found: docs\/nope\.md/);
  h.assertFails(h.run(root, 'scout-merge.js', ['--from', 'docs', entries]), 1, /Not a file: docs/);
  assert.ok(!fs.existsSync(seedsFile));
  assert.ok(!fs.existsSync(reportsDir));

  assert.match(h.ok(root, 'scout-merge.js', ['--from', 'docs/review.md', entries]).out, /`\/gps start safe-linking` — Critical · Strong — C1: p/);
  const summary = h.json(root, 'scout-merge.js', ['--from', 'docs/review.md', entries]);
  assert.match(summary.sourceReport, /^scout-reports\/review-review-.+\.md$/);
  assert.deepStrictEqual(summary.seeded.map((s) => s.severity), ['Critical']);
  const seeds = JSON.parse(fs.readFileSync(seedsFile, 'utf-8'));
  assert.strictEqual(seeds['safe-linking'].sourcePath, 'docs/review.md');
  assert.strictEqual(seeds['safe-linking'].sourceDirection, 'only Critical and High');
  assert.strictEqual(fs.readFileSync(path.join(h.sessionsDir(root), summary.sourceReport), 'utf-8'), '# Review\n');
}

h.done('scout-merge.test.js');
