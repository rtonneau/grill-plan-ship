// scripts/lib/phase.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { isFinishedConfig, derivePhaseLabel, suggestNext, computeSessionState } = require('./phase');

const empty = { tickets: [], nextPending: null };

// finished wins over any file state (finished_at, or legacy status "completed")
assert.strictEqual(derivePhaseLabel({ target: 'grill' }, empty, { finished_at: 'x' }), 'finished');
assert.strictEqual(derivePhaseLabel({ target: 'grill' }, empty, { status: 'completed' }), 'finished');
assert.ok(!isFinishedConfig({ status: 'plan-in-progress' }));
assert.ok(!isFinishedConfig(null));

// legacy status fields are ignored for everything else
assert.strictEqual(derivePhaseLabel({ target: 'grill' }, empty, { status: 'plan-in-progress' }), 'grill');

// suggestNext covers every phase
const queue = { tickets: [{ num: '03', slug: 'x' }], nextPending: { num: '03', slug: 'x' } };
assert.strictEqual(suggestNext('grill').command, '/gps write');
assert.strictEqual(suggestNext('plan-not-started').command, '/gps plan');
assert.match(suggestNext('plan-not-started').why, /bounded/);
assert.strictEqual(suggestNext('plan').command, '/gps write');
assert.strictEqual(suggestNext('ship', queue).command, '/gps ship');
assert.match(suggestNext('ship', queue).why, /\/gps ticket 3/);
assert.strictEqual(suggestNext('finish-pending').command, '/gps finish');
assert.strictEqual(suggestNext('plan-complete').command, '/gps finish');
assert.strictEqual(suggestNext('finished').command, '/gps start <feature-name>');

// computeSessionState against real files
const sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-phase-'));
fs.mkdirSync(path.join(sessionDir, '01-grill'));
fs.writeFileSync(path.join(sessionDir, '01-grill', 'resume.md'), '{{ x }}');
let state = computeSessionState(sessionDir, {});
assert.strictEqual(state.phase, 'grill');
assert.strictEqual(state.suggestedNext.command, '/gps write');

fs.writeFileSync(path.join(sessionDir, '01-grill', 'resume.md'), 'done');
state = computeSessionState(sessionDir, {});
assert.strictEqual(state.phase, 'plan-not-started');

fs.rmSync(sessionDir, { recursive: true, force: true });
console.log('phase.test.js: all assertions passed');
