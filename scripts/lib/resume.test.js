// scripts/lib/resume.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildResumeReport, parseHandoffMarkdown } = require('./resume');

// -- parseHandoffMarkdown, tested directly against a sample document --
const sample = [
  '# Handoff: test-feature',
  '',
  '**Session:** 2026-09-22__test-feature',
  '**Current phase:** ship',
  '**Active ticket:** 01-add-thing',
  '',
  '## Where I Stopped',
  '',
  'Debugging the flaky test.',
  '',
  '## Next Step',
  '',
  'Re-run the test in isolation.',
  '',
].join('\n');

const parsed = parseHandoffMarkdown(sample);
assert.strictEqual(parsed.meta['Session'], '2026-09-22__test-feature');
assert.strictEqual(parsed.meta['Current phase'], 'ship');
assert.strictEqual(parsed.meta['Active ticket'], '01-add-thing');
assert.strictEqual(parsed.sections['Where I Stopped'], 'Debugging the flaky test.');
assert.strictEqual(parsed.sections['Next Step'], 'Re-run the test in isolation.');

// -- buildResumeReport, end-to-end against a real session directory --
const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-resume-'));
const sessionDir = path.join(projectRoot, '.work', 'sessions', '2026-09-22__test-feature');
fs.mkdirSync(path.join(sessionDir, '01-grill'), { recursive: true });
fs.writeFileSync(
  path.join(sessionDir, '.session-config.json'),
  JSON.stringify({
    session_id: '2026-09-22__test-feature',
    feature_name: 'test-feature',
    created_at: '2026-09-22T10:00:00.000Z',
    phases_completed: [],
    status: 'grill-in-progress',
  })
);
fs.writeFileSync(path.join(sessionDir, '01-grill', 'resume.md'), '# {{ feature-name }}\n');

// No HANDOFF.md yet -> handoff is null, live state is still populated, no drift.
let report = buildResumeReport(sessionDir, projectRoot);
assert.strictEqual(report.handoff, null);
assert.strictEqual(report.live.currentPhase, 'grill');
assert.strictEqual(report.drift, null);

// A handoff that matches current live state -> no drift.
fs.writeFileSync(
  path.join(sessionDir, 'HANDOFF.md'),
  '**Current phase:** grill\n**Active ticket:** none\n\n## Next Step\n\nKeep grilling.\n'
);
report = buildResumeReport(sessionDir, projectRoot);
assert.strictEqual(report.handoff.sections['Next Step'], 'Keep grilling.');
assert.strictEqual(report.drift, null);

// A stale handoff (says 'plan', but grill is still pending) -> drift is reported.
fs.writeFileSync(
  path.join(sessionDir, 'HANDOFF.md'),
  '**Current phase:** plan\n**Active ticket:** none\n\n## Next Step\n\nWrite the plan.\n'
);
report = buildResumeReport(sessionDir, projectRoot);
assert.ok(report.drift.includes('"plan"'));
assert.ok(report.drift.includes('"grill"'));

fs.rmSync(projectRoot, { recursive: true, force: true });
console.log('resume.test.js: all assertions passed');
