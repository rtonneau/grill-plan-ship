// tests/status.test.js — status.js (/gps status). Report details: tests/lib/status.test.js.
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const h = require('./helpers');

// Hash of every file under .work/, to prove status is read-only.
function hashWork(root) {
  const hash = crypto.createHash('sha256');
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else hash.update(path.relative(root, full)).update(fs.readFileSync(full));
    }
  };
  walk(path.join(root, '.work'));
  return hash.digest('hex');
}

{
  // Nothing at all -> clear error.
  const root = h.tempProject();
  h.assertFails(h.run(root, 'status.js'), 1, /No sessions found/);
  h.assertFails(h.run(root, 'status.js', ['--bogus']), 2, /Unknown option/);
}

{
  // Scouted ideas but no session -> listed, and the first one is suggested.
  const root = h.tempProject();
  fs.mkdirSync(h.sessionsDir(root), { recursive: true });
  fs.writeFileSync(path.join(h.sessionsDir(root), '.pending-seeds.json'),
    JSON.stringify({ 'safe-linking': { strength: 'Strong', severity: 'Critical', problem: 'C1: data loss', solution: 's' } }));
  const report = h.json(root, 'status.js');
  assert.deepStrictEqual(report.ideas.map((i) => i.slug), ['safe-linking']);
  assert.strictEqual(report.suggestedNext.command, '/gps start safe-linking');
  const text = h.ok(root, 'status.js').out;
  assert.match(text, /## Scouted ideas not started/);
  assert.match(text, /\| safe-linking \| Critical · Strong \| C1: data loss \| `\/gps start safe-linking` \|/);
  assert.match(text, /Next: \/gps start safe-linking/);
}

{
  // Phase, drift and the next command follow the session; status never writes.
  const root = h.gitProject();
  h.ok(root, 'start.js', ['drift']);
  const check = (phase, command) => {
    const before = hashWork(root);
    const report = h.json(root, 'status.js');
    assert.strictEqual(hashWork(root), before, 'status.js modified .work/');
    assert.strictEqual(report.current.phase, phase);
    assert.strictEqual(report.current.suggestedNext.command, command);
    return report;
  };
  check('grill', '/gps write');
  h.writeGrill(root);
  check('plan-not-started', '/gps plan');
  h.writePlan(root, ['a']);
  check('ship', '/gps ship');
  h.ok(root, 'ticket-start.js');
  assert.strictEqual(h.json(root, 'status.js').sessions[0].phaseDrift, null);

  // A ticket set to Done by hand -> drift is reported (and explained in the text).
  const log = path.join(h.sessionDir(root), '03-implement', '01-a', 'commit-log.md');
  fs.writeFileSync(log, fs.readFileSync(log, 'utf-8').replace('**Status:** In Progress', '**Status:** ✅ Done'));
  assert.deepStrictEqual(h.json(root, 'status.js').sessions[0].phaseDrift, { recorded: 'ship', derived: 'finish-pending' });
  assert.match(h.ok(root, 'status.js').out, /⚠️ recorded phase "ship" differs from its files/);
  fs.writeFileSync(log, fs.readFileSync(log, 'utf-8').replace('**Status:** ✅ Done', '**Status:** In Progress'));
  h.fillLog(root, '01-a');
  fs.writeFileSync(path.join(root, 'a.js'), 'a\n');
  h.ok(root, 'ticket-complete.js', ['1', '--message', 'feat: a', '--file', 'a.js']);
  const report = check('finish-pending', '/gps finish');
  assert.strictEqual(report.sessions[0].phaseDrift, null);
  assert.ok(report.current.gitLog.some((line) => line.includes('feat: a')));

  // A saved handoff is shown (what /gps resume used to do).
  h.ok(root, 'handoff.js');
  const handoffPath = path.join(h.sessionDir(root), 'HANDOFF.md');
  fs.writeFileSync(handoffPath, fs.readFileSync(handoffPath, 'utf-8')
    .replace(/(## Next Step\n\n)<!--[^>]*-->/, '$1Run /gps finish.'));
  const text = h.ok(root, 'status.js').out;
  assert.match(text, /## Handoff \(saved /);
  assert.match(text, /\*\*Next Step:\*\* Run \/gps finish\./);
  assert.match(text, /\*\*Where I Stopped:\*\* \(not filled\)/);
  assert.doesNotMatch(text, /Drift since the handoff/);
}

{
  // No pointer -> no fallback; status still lists sessions and says how to recover.
  const root = h.tempProject();
  h.ok(root, 'start.js', ['real']);
  fs.unlinkSync(path.join(h.sessionsDir(root), '.current-session'));
  const report = h.json(root, 'status.js');
  assert.strictEqual(report.current, null);
  assert.strictEqual(report.currentProblem.code, 'no-pointer');
  assert.match(h.ok(root, 'status.js').out, /No current session is selected[\s\S]*set-current\.js/);
  assert.ok(!fs.existsSync(path.join(h.sessionsDir(root), '.current-session')));
}

h.done('status.test.js');
