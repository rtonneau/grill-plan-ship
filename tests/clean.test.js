// tests/clean.test.js — clean.js (/gps clean: list, --dry-run, --delete)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const h = require('./helpers');

const root = h.tempProject('gps-clean-');
const sessionsDir = h.sessionsDir(root);
const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
const clean = (...args) => h.run(root, 'clean.js', args);
const list = () => h.json(root, 'clean.js');

function addSession(id, createdDaysAgo, extra = {}) {
  const dir = path.join(sessionsDir, id);
  fs.mkdirSync(path.join(dir, '01-grill'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.session-config.json'),
    JSON.stringify({ feature_name: id, created_at: daysAgo(createdDaysAgo), ...extra }));
}

// No sessions directory -> clean error.
h.assertFails(clean(), 1, /Nothing to clean/);

addSession('old', 40);
addSession('mid', 20, { git: { branch: 'feat/mid' } });
addSession('fresh', 1);
fs.mkdirSync(path.join(sessionsDir, 'mid', '03-implement', '01-a'), { recursive: true });
fs.writeFileSync(path.join(sessionsDir, '.current-session'), 'fresh');
fs.writeFileSync(path.join(sessionsDir, '.pending-seeds.json'), '{}');

// List: most idle first, tiers set, current not deletable, read-only.
{
  const report = list();
  assert.deepStrictEqual(report.sessions.map((s) => s.sessionId), ['old', 'mid', 'fresh']);
  assert.deepStrictEqual(report.sessions.map((s) => s.staleness), ['very-stale', 'stale', null]);
  assert.strictEqual(report.sessions[1].branch, 'feat/mid');
  assert.strictEqual(report.sessions[2].current, true);
  assert.strictEqual(report.sessions[2].deletable, false);
  const text = h.ok(root, 'clean.js').out;
  assert.match(text, /## Sessions \(most idle first\)/);
  assert.match(text, /\| old \| old \| unfinished \| 40 \| very-stale \|/);
  assert.match(text, /\| fresh \| fresh \| unfinished \| 1 \| current \(not deletable\) \|/);
  assert.match(text, /Next: pick the ids to remove; clean\.js --dry-run/);
  assert.ok(fs.existsSync(path.join(sessionsDir, 'old')));
}

// Usage errors: exit 2.
h.assertFails(clean('--delete'), 2, /Name the ids/);
h.assertFails(clean('old'), 2, /need --dry-run or --delete/);
h.assertFails(clean('--dry-run', '--delete', 'old'), 2, /not both/);

// The current session and unknown or unsafe ids abort the whole batch.
h.assertFails(clean('--delete', 'old', 'fresh'), 1, /current session/);
h.assertFails(clean('--delete', 'old', 'nope'), 1, /neither a session nor a scouted idea/);
h.assertFails(clean('--delete', '..'), 1, /Invalid session or idea id/);
assert.ok(fs.existsSync(path.join(sessionsDir, 'old')), 'a failed batch deletes nothing');

// --dry-run: exactly what would go, with warnings; changes nothing.
{
  const res = h.ok(root, 'clean.js', ['--dry-run', 'old', 'mid']);
  assert.match(res.out, /Would delete \(cannot be undone\):/);
  assert.match(res.out, /- session old \(old\): unfinished, idle 40 days/);
  assert.match(res.out, /⚠️ mid has 1 ticket\(s\) started\./);
  assert.match(res.out, /⚠️ mid has branch feat\/mid: kept, only the local session folder goes\./);
  assert.match(res.out, /Next: confirm with the user, then run clean\.js --delete old mid\./);
  const plan = h.json(root, 'clean.js', ['--dry-run', 'old', 'mid']);
  assert.strictEqual(plan.dryRun, true);
  assert.deepStrictEqual(plan.sessions.map((s) => s.sessionId), ['old', 'mid']);
  assert.strictEqual(plan.warnings.length, 4);
  assert.ok(fs.existsSync(path.join(sessionsDir, 'old')) && fs.existsSync(path.join(sessionsDir, 'mid')));
}

// --delete removes only the named sessions and leaves the state files alone.
{
  const done = h.ok(root, 'clean.js', ['--delete', 'old', 'mid']);
  assert.match(done.out, /✅ Deleted session old\.\n✅ Deleted session mid\./);
  assert.ok(!fs.existsSync(path.join(sessionsDir, 'old')));
  assert.ok(!fs.existsSync(path.join(sessionsDir, 'mid')));
  assert.ok(fs.existsSync(path.join(sessionsDir, 'fresh')));
  assert.strictEqual(fs.readFileSync(path.join(sessionsDir, '.current-session'), 'utf-8'), 'fresh');
  assert.ok(fs.existsSync(path.join(sessionsDir, '.pending-seeds.json')));
}

// Scouted ideas: listed oldest first, dropped alone or mixed with sessions.
{
  const seedsFile = path.join(sessionsDir, '.pending-seeds.json');
  const readSeeds = () => JSON.parse(fs.readFileSync(seedsFile, 'utf-8'));
  addSession('stale', 30);
  fs.writeFileSync(seedsFile, JSON.stringify({
    'runconfig-resolver': { problem: 'Config lookup is scattered', strength: 'Strong', createdAt: daysAgo(10) },
    'cache-layer': { problem: 'Slow reads', createdAt: daysAgo(2) },
    'keep-me': { problem: 'Unrelated' },
  }));

  const report = list();
  assert.deepStrictEqual(report.ideas.map((i) => i.slug), ['runconfig-resolver', 'cache-layer', 'keep-me']);
  assert.deepStrictEqual(report.ideas.map((i) => i.idleDays), [10, 2, null]);
  assert.strictEqual(report.ideasProblem, null);
  assert.match(h.ok(root, 'clean.js').out, /\| runconfig-resolver \| Strong \| 10 \| Config lookup is scattered \|/);
  assert.match(h.ok(root, 'clean.js', ['--dry-run', 'cache-layer']).out, /- idea cache-layer: Slow reads/);

  const bad = clean('--delete', 'runconfig-resolver', 'stale', 'nope');
  h.assertFails(bad, 1, /Ideas: runconfig-resolver, cache-layer, keep-me/);
  assert.ok(readSeeds()['runconfig-resolver']);
  assert.ok(fs.existsSync(path.join(sessionsDir, 'stale')));

  assert.match(h.ok(root, 'clean.js', ['--delete', 'runconfig-resolver']).out, /Dropped scouted idea runconfig-resolver/);
  assert.deepStrictEqual(Object.keys(readSeeds()), ['cache-layer', 'keep-me']);
  const mixed = h.json(root, 'clean.js', ['--delete', 'cache-layer', 'stale']);
  assert.deepStrictEqual(mixed.deleted, { sessions: ['stale'], orphanScratch: [], ideas: ['cache-layer'] });
  assert.ok(!fs.existsSync(path.join(sessionsDir, 'stale')));
  assert.deepStrictEqual(Object.keys(readSeeds()), ['keep-me']);

  // An unreadable seeds file is reported, never moved aside or rewritten.
  fs.writeFileSync(seedsFile, '{ broken');
  const broken = list();
  assert.deepStrictEqual(broken.ideas, []);
  assert.ok(broken.ideasProblem);
  h.assertFails(clean('--delete', 'keep-me'), 1, /unreadable/);
  assert.strictEqual(fs.readFileSync(seedsFile, 'utf-8'), '{ broken');
  assert.ok(!fs.readdirSync(sessionsDir).some((f) => f.includes('corrupt')));
}

// Only ideas left: still listed.
{
  fs.writeFileSync(path.join(sessionsDir, '.pending-seeds.json'), JSON.stringify({ solo: {} }));
  fs.rmSync(path.join(sessionsDir, 'fresh'), { recursive: true, force: true });
  const report = list();
  assert.deepStrictEqual(report.sessions, []);
  assert.deepStrictEqual(report.ideas.map((i) => i.slug), ['solo']);
}

// Scratch dirs: a session's goes with it, an orphan is listed, sized, validated and deleted.
{
  const scratch = (id, bytes = 0) => {
    const dir = path.join(root, '.scratch', 'tests', id);
    fs.mkdirSync(path.join(dir, 'build'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'build', 'out.bin'), 'x'.repeat(bytes));
    return dir;
  };
  addSession('with-scratch', 5);
  addSession('current-one', 1);
  fs.writeFileSync(path.join(sessionsDir, '.current-session'), 'current-one');
  fs.writeFileSync(path.join(sessionsDir, '.pending-seeds.json'), '{}');
  const sessionScratch = scratch('with-scratch', 2048);
  scratch('current-one', 10);
  const orphanDir = scratch('gone-session', 3072);
  const orphanDir2 = scratch('gone-too', 5);

  const report = list();
  assert.deepStrictEqual(report.orphanScratch.map((o) => [o.id, o.path, o.bytes]),
    [['gone-session', '.scratch/tests/gone-session', 3072], ['gone-too', '.scratch/tests/gone-too', 5]]);
  assert.strictEqual(report.sessions.find((s) => s.sessionId === 'with-scratch').scratch.bytes, 2048);
  assert.strictEqual(report.sessions.find((s) => s.sessionId === 'current-one').scratch.bytes, 10);
  const text = h.ok(root, 'clean.js').out;
  assert.match(text, /## Orphan scratch dirs/);
  assert.match(text, /\| \.scratch\/tests\/gone-session \| 3\.0 KB \|/);
  assert.ok(!/## Orphan scratch dirs[\s\S]*current-one/.test(text), 'the current session is never an orphan');

  // --dry-run shows the scratch path and size for sessions and orphans.
  const dry = h.ok(root, 'clean.js', ['--dry-run', 'with-scratch', 'gone-session']);
  assert.match(dry.out, /- session with-scratch .*\n {2}- scratch dir \.scratch\/tests\/with-scratch \(2\.0 KB\)/);
  assert.match(dry.out, /- orphan scratch dir \.scratch\/tests\/gone-session \(3\.0 KB\)/);
  const plan = h.json(root, 'clean.js', ['--dry-run', 'with-scratch', 'gone-session']);
  assert.strictEqual(plan.sessions[0].scratch.path, '.scratch/tests/with-scratch');
  assert.deepStrictEqual(plan.orphanScratch.map((o) => o.path), ['.scratch/tests/gone-session']);
  assert.ok(fs.existsSync(sessionScratch) && fs.existsSync(orphanDir));

  // An unknown id refuses the whole batch; nothing is removed.
  h.assertFails(clean('--delete', 'gone-session', 'nope'), 1, /neither a session nor a scouted idea/);
  h.assertFails(clean('--delete', 'with-scratch', 'current-one'), 1, /current session/);
  assert.ok(fs.existsSync(sessionScratch) && fs.existsSync(orphanDir));

  const done = h.ok(root, 'clean.js', ['--delete', 'with-scratch', 'gone-session']);
  assert.match(done.out, /✅ Deleted session with-scratch\.\n✅ Deleted scratch dir \.scratch\/tests\/gone-session\./);
  assert.ok(!fs.existsSync(sessionScratch) && !fs.existsSync(orphanDir));
  assert.ok(fs.existsSync(orphanDir2) && fs.existsSync(path.join(root, '.scratch', 'tests', 'current-one')));
  assert.ok(!fs.existsSync(path.join(sessionsDir, 'with-scratch')));

  // Orphans alone are something to clean, even with no sessions directory.
  fs.rmSync(sessionsDir, { recursive: true, force: true });
  const only = h.json(root, 'clean.js');
  assert.deepStrictEqual(only.sessions, []);
  assert.deepStrictEqual(only.orphanScratch.map((o) => o.id), ['current-one', 'gone-too']);
  assert.match(h.ok(root, 'clean.js', ['--delete', 'gone-too']).out, /✅ Deleted scratch dir \.scratch\/tests\/gone-too\./);
  fs.rmSync(path.join(root, '.scratch'), { recursive: true, force: true });
  h.assertFails(clean(), 1, /Nothing to clean/);
}

fs.rmSync(root, { recursive: true, force: true });
h.done('clean.test.js');
