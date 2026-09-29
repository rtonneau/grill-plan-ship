// scripts/clean.test.js
//
// Runs the real clean.js handler in a throwaway project.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function run(cwd, ...args) {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'clean.js'), ...args], { cwd, encoding: 'utf-8' });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-clean-'));
const sessionsDir = path.join(root, '.work', 'sessions');
const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

function addSession(id, createdDaysAgo, extra = {}) {
  const dir = path.join(sessionsDir, id);
  fs.mkdirSync(path.join(dir, '01-grill'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.session-config.json'),
    JSON.stringify({ feature_name: id, created_at: daysAgo(createdDaysAgo), ...extra }));
}

// No sessions directory -> clean error
{
  const empty = run(root);
  assert.strictEqual(empty.code, 1);
  assert.match(empty.err, /No sessions found/);
}

addSession('old', 40);
addSession('mid', 20, { git: { branch: 'gps/mid' } });
addSession('fresh', 1);
fs.writeFileSync(path.join(sessionsDir, '.current-session'), 'fresh');
fs.writeFileSync(path.join(sessionsDir, '.pending-seeds.json'), '{}');

// List: most idle first, tiers set, current not deletable, read-only
{
  const listed = run(root);
  assert.strictEqual(listed.code, 0, listed.err);
  const report = JSON.parse(listed.out);
  assert.deepStrictEqual(report.sessions.map((s) => s.sessionId), ['old', 'mid', 'fresh']);
  assert.deepStrictEqual(report.sessions.map((s) => s.staleness), ['very-stale', 'stale', null]);
  assert.strictEqual(report.sessions[1].branch, 'gps/mid');
  assert.strictEqual(report.sessions[2].current, true);
  assert.strictEqual(report.sessions[2].deletable, false);
  assert.ok(fs.existsSync(path.join(sessionsDir, 'old')));
}

// The current session and unknown or unsafe ids are refused, and abort the whole batch
{
  const cur = run(root, '--delete', 'old', 'fresh');
  assert.strictEqual(cur.code, 1);
  assert.match(cur.err, /current session/);
  const missing = run(root, '--delete', 'old', 'nope');
  assert.strictEqual(missing.code, 1);
  assert.match(missing.err, /not found/);
  const unsafe = run(root, '--delete', '..');
  assert.strictEqual(unsafe.code, 1);
  assert.match(unsafe.err, /Invalid session id/);
  assert.ok(fs.existsSync(path.join(sessionsDir, 'old')), 'a failed batch deletes nothing');
  assert.ok(fs.existsSync(path.join(sessionsDir, 'mid')));
}

// Bad usage
{
  assert.strictEqual(run(root, '--delete').code, 1);
  assert.strictEqual(run(root, 'old').code, 1);
}

// Valid delete removes only the named sessions and leaves the state files alone
{
  const done = run(root, '--delete', 'old', 'mid');
  assert.strictEqual(done.code, 0, done.err);
  assert.match(done.out, /Deleted session old/);
  assert.ok(!fs.existsSync(path.join(sessionsDir, 'old')));
  assert.ok(!fs.existsSync(path.join(sessionsDir, 'mid')));
  assert.ok(fs.existsSync(path.join(sessionsDir, 'fresh')));
  assert.strictEqual(fs.readFileSync(path.join(sessionsDir, '.current-session'), 'utf-8'), 'fresh');
  assert.ok(fs.existsSync(path.join(sessionsDir, '.pending-seeds.json')));
}

console.log('clean.test.js: all assertions passed');
