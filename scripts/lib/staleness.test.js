// scripts/lib/staleness.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { computeIdleness, stalenessOf } = require('./staleness');

const now = new Date('2026-09-29T12:00:00.000Z');
const daysAgo = (n) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

// Tier boundaries
assert.strictEqual(stalenessOf(null), null);
assert.strictEqual(stalenessOf(13), null);
assert.strictEqual(stalenessOf(14), 'stale');
assert.strictEqual(stalenessOf(27), 'stale');
assert.strictEqual(stalenessOf(28), 'very-stale');

const sessionsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-staleness-'));
fs.mkdirSync(path.join(sessionsDir, 's'));

// Newest history event wins over created_at
{
  const config = {
    created_at: daysAgo(60),
    history: [{ at: daysAgo(40), event: 'session_started' }, { at: daysAgo(15), event: 'plan_started' }],
  };
  const idle = computeIdleness(sessionsDir, 's', config, now);
  assert.strictEqual(idle.idleDays, 15);
  assert.strictEqual(idle.staleness, 'stale');
  assert.strictEqual(idle.lastActivityAt, daysAgo(15));
}

// No history: backfilled from created_at / finished_at
{
  const idle = computeIdleness(sessionsDir, 's', { created_at: daysAgo(30), finished_at: daysAgo(29) }, now);
  assert.strictEqual(idle.idleDays, 29);
  assert.strictEqual(idle.staleness, 'very-stale');
}

// Recent activity is not flagged
{
  const idle = computeIdleness(sessionsDir, 's', { created_at: daysAgo(2) }, now);
  assert.strictEqual(idle.idleDays, 2);
  assert.strictEqual(idle.staleness, null);
}

// Unreadable config or bad dates fall back to the directory mtime
{
  const idle = computeIdleness(sessionsDir, 's', null, now);
  assert.ok(idle.lastActivityAt);
  const bad = computeIdleness(sessionsDir, 's', { created_at: 'not a date', history: 'nope' }, now);
  assert.ok(bad.lastActivityAt);
}

// Nothing at all -> unknown, never flagged
{
  const idle = computeIdleness(sessionsDir, 'missing', null, now);
  assert.deepStrictEqual(idle, { lastActivityAt: null, idleDays: null, staleness: null });
}

console.log('staleness.test.js: all assertions passed');
