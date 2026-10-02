// tests/lib/handoff.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildHandoffData, parseHandoffMarkdown, readHandoff,
} = require('../../skills/gps/scripts/lib/handoff');
const { derivePhaseLabel } = require('../../skills/gps/scripts/lib/phase');

function writeConfig(sessionDir, overrides) {
  fs.writeFileSync(
    path.join(sessionDir, '.session-config.json'),
    JSON.stringify({
      session_id: '2026-09-22__test-feature',
      feature_name: 'test-feature',
      created_at: '2026-09-22T10:00:00.000Z',
      phases_completed: [],
      status: 'grill-in-progress',
      ...overrides,
    })
  );
}

// -- derivePhaseLabel, tested directly against the {target, reason} / {tickets, nextPending} shapes --
assert.strictEqual(derivePhaseLabel({ target: 'grill' }, { tickets: [], nextPending: null }), 'grill');
assert.strictEqual(derivePhaseLabel({ target: 'plan' }, { tickets: [], nextPending: null }), 'plan');
assert.strictEqual(
  derivePhaseLabel({ target: 'none', reason: 'plan-not-started' }, { tickets: [], nextPending: null }),
  'plan-not-started'
);
assert.strictEqual(
  derivePhaseLabel({ target: 'none', reason: 'complete' }, { tickets: [{ num: '01' }], nextPending: { num: '01' } }),
  'ship'
);
assert.strictEqual(
  derivePhaseLabel({ target: 'none', reason: 'complete' }, { tickets: [{ num: '01' }], nextPending: null }),
  'finish-pending'
);
assert.strictEqual(
  derivePhaseLabel({ target: 'none', reason: 'complete' }, { tickets: [], nextPending: null }),
  'plan-complete'
);

// -- buildHandoffData, end-to-end against a real session directory --
const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-handoff-'));
const sessionDir = path.join(projectRoot, '.work', 'sessions', '2026-09-22__test-feature');
fs.mkdirSync(path.join(sessionDir, '01-grill'), { recursive: true });
writeConfig(sessionDir);
fs.writeFileSync(path.join(sessionDir, '01-grill', 'resume.md'), '# {{ feature-name }}\n');

// Grill still pending.
let data = buildHandoffData(sessionDir, projectRoot);
assert.strictEqual(data.sessionId, '2026-09-22__test-feature');
assert.strictEqual(data.featureName, 'test-feature');
assert.strictEqual(data.currentPhase, 'grill');
assert.strictEqual(data.activeTicket, null);
assert.deepStrictEqual(data.ticketQueueSummary, []);
assert.deepStrictEqual(data.gitLog, []);
assert.deepStrictEqual(data.gitStatus, { project: [], session: [] });
assert.ok(typeof data.timestamp === 'string' && data.timestamp.length > 0);

// Fill grill, add one pending ticket -> phase is 'ship'.
fs.writeFileSync(path.join(sessionDir, '01-grill', 'resume.md'), '# test-feature\n\nDone.\n');
const ticketsDir = path.join(sessionDir, '02-plan', 'tickets');
fs.mkdirSync(ticketsDir, { recursive: true });
fs.writeFileSync(path.join(sessionDir, '02-plan', 'plan.md'), '# Plan\n\nNo placeholders.\n');
fs.writeFileSync(path.join(ticketsDir, '01-add-thing.md'), '# Ticket 1: add-thing\n');

data = buildHandoffData(sessionDir, projectRoot);
assert.strictEqual(data.currentPhase, 'ship');
assert.strictEqual(data.activeTicket, '01-add-thing');
assert.deepStrictEqual(data.ticketQueueSummary, ['01-add-thing: pending']);

// Mark the ticket done -> phase is 'finish-pending', no active ticket.
const implDir = path.join(sessionDir, '03-implement', '01-add-thing');
fs.mkdirSync(implDir, { recursive: true });
fs.writeFileSync(path.join(implDir, 'commit-log.md'), '**Status:** ✅ Done\n');

data = buildHandoffData(sessionDir, projectRoot);
assert.strictEqual(data.currentPhase, 'finish-pending');
assert.strictEqual(data.activeTicket, null);
assert.deepStrictEqual(data.ticketQueueSummary, ['01-add-thing: done']);

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

// -- readHandoff: null without HANDOFF.md, drift when it no longer matches live state --
assert.strictEqual(readHandoff(sessionDir, { phase: 'finish-pending', activeTicket: null }), null);
fs.writeFileSync(path.join(sessionDir, 'HANDOFF.md'), '**Current phase:** ship\n**Active ticket:** 01-add-thing\n\n## Next Step\n\nFinish it.\n');
assert.strictEqual(readHandoff(sessionDir, { phase: 'ship', activeTicket: '01-add-thing' }).drift, null);
const stale = readHandoff(sessionDir, { phase: 'finish-pending', activeTicket: null });
assert.strictEqual(stale.sections['Next Step'], 'Finish it.');
assert.match(stale.drift, /current phase was "ship"; it is now "finish-pending"/);
assert.match(stale.drift, /active ticket was "01-add-thing"; it is now "none"/);

fs.rmSync(projectRoot, { recursive: true, force: true });
console.log('handoff.test.js: all assertions passed');
