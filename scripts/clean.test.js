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
  assert.match(empty.err, /Nothing to clean/);
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
  assert.match(missing.err, /neither a session nor a scouted idea/);
  const unsafe = run(root, '--delete', '..');
  assert.strictEqual(unsafe.code, 1);
  assert.match(unsafe.err, /Invalid session or idea id/);
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

// Scouted ideas: listed oldest first, dropped alone or mixed with sessions
{
  const seedsFile = path.join(sessionsDir, '.pending-seeds.json');
  const readSeeds = () => JSON.parse(fs.readFileSync(seedsFile, 'utf-8'));
  addSession('stale', 30);
  fs.writeFileSync(seedsFile, JSON.stringify({
    'runconfig-resolver': { problem: 'Config lookup is scattered', strength: 'strong', createdAt: daysAgo(10) },
    'cache-layer': { problem: 'Slow reads', createdAt: daysAgo(2) },
    'keep-me': { problem: 'Unrelated' },
  }));

  const report = JSON.parse(run(root).out);
  assert.deepStrictEqual(report.ideas.map((i) => i.slug), ['runconfig-resolver', 'cache-layer', 'keep-me']);
  assert.deepStrictEqual(report.ideas.map((i) => i.idleDays), [10, 2, null]);
  assert.strictEqual(report.ideas[0].problem, 'Config lookup is scattered');
  assert.strictEqual(report.ideasProblem, null);

  // An unknown id aborts the batch: the idea and the session stay
  const bad = run(root, '--delete', 'runconfig-resolver', 'stale', 'nope');
  assert.strictEqual(bad.code, 1);
  assert.match(bad.err, /Ideas: runconfig-resolver, cache-layer, keep-me/);
  assert.ok(readSeeds()['runconfig-resolver']);
  assert.ok(fs.existsSync(path.join(sessionsDir, 'stale')));

  const one = run(root, '--delete', 'runconfig-resolver');
  assert.strictEqual(one.code, 0, one.err);
  assert.match(one.out, /Dropped scouted idea runconfig-resolver/);
  assert.deepStrictEqual(Object.keys(readSeeds()), ['cache-layer', 'keep-me']);

  const mixed = run(root, '--delete', 'cache-layer', 'stale');
  assert.strictEqual(mixed.code, 0, mixed.err);
  assert.match(mixed.out, /Deleted session stale\.\s+✅ Dropped scouted idea cache-layer\./);
  assert.ok(!fs.existsSync(path.join(sessionsDir, 'stale')));
  assert.deepStrictEqual(Object.keys(readSeeds()), ['keep-me']);

  // An unreadable seeds file is reported, never moved aside or rewritten
  fs.writeFileSync(seedsFile, '{ broken');
  const listed = JSON.parse(run(root).out);
  assert.deepStrictEqual(listed.ideas, []);
  assert.ok(listed.ideasProblem);
  const refused = run(root, '--delete', 'keep-me');
  assert.strictEqual(refused.code, 1);
  assert.match(refused.err, /unreadable/);
  assert.strictEqual(fs.readFileSync(seedsFile, 'utf-8'), '{ broken');
  assert.ok(!fs.readdirSync(sessionsDir).some((f) => f.includes('corrupt')));
}

// Only ideas left, no sessions besides the current one: still listed
{
  fs.writeFileSync(path.join(sessionsDir, '.pending-seeds.json'), JSON.stringify({ solo: {} }));
  fs.rmSync(path.join(sessionsDir, 'fresh'), { recursive: true, force: true });
  const report = JSON.parse(run(root).out);
  assert.deepStrictEqual(report.sessions, []);
  assert.deepStrictEqual(report.ideas.map((i) => i.slug), ['solo']);
}

fs.rmSync(root, { recursive: true, force: true });
console.log('clean.test.js: all assertions passed');
