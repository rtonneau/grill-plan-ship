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
  // Nothing at all -> clear error in text; an empty report (exit 0) in JSON.
  const root = h.tempProject();
  h.assertFails(h.run(root, 'status.js'), 1, /No sessions found/);
  h.assertFails(h.run(root, 'status.js', ['--bogus']), 2, /Unknown option/);
  const version = require('../package.json').version;
  let report = h.json(root, 'status.js');
  assert.deepStrictEqual(report, {
    schemaVersion: 2, gpsVersion: version,
    sessions: [], seeds: [], seedsProblem: null, finishRecovery: null, current: null,
    currentProblem: { code: 'no-work-dir', message: 'No sessions found.', hint: 'Run /gps start <feature-name> (or /gps scout for seeds) first.' },
    worktrees: [],
  });
  fs.mkdirSync(h.sessionsDir(root), { recursive: true });
  h.assertFails(h.run(root, 'status.js'), 1, /No sessions found/);
  report = h.json(root, 'status.js');
  assert.strictEqual(report.currentProblem.code, 'no-sessions');
  assert.strictEqual(report.schemaVersion, 2);
}

{
  // Schema v2: ticket state and blocker replace done; recent events are listed.
  const root = h.gitProject();
  h.shipReady(root, 'v2', ['a', 'b']);
  let current = h.json(root, 'status.js').current;
  assert.deepStrictEqual(current.tickets.map((t) => [t.state, t.blocker]), [['pending', null], ['pending', null]]);
  assert.ok(current.tickets.every((t) => !('done' in t)), 'done is gone from schema v2');
  assert.strictEqual(current.nextPending.state, 'pending');
  h.ok(root, 'ticket-start.js', ['1']);
  h.ok(root, 'ticket-block.js', ['1', '--reason', 'needs a key']);
  const report = h.json(root, 'status.js');
  current = report.current;
  assert.strictEqual(report.schemaVersion, 2);
  assert.strictEqual(current.tickets[0].state, 'blocked');
  assert.strictEqual(current.tickets[0].blocker.reason, 'needs a key');
  assert.match(current.tickets[0].blocker.at, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepStrictEqual(current.nextPending.blocker, current.tickets[0].blocker);
  const last = current.recentEvents[current.recentEvents.length - 1];
  assert.deepStrictEqual(Object.keys(last), ['at', 'event', 'phase', 'detail']);
  assert.strictEqual(last.event, 'ticket_blocked');
  assert.deepStrictEqual(last.detail, { ticket: '01-a', reason: 'needs a key' });
  assert.match(h.ok(root, 'status.js').out, /- ⛔ Blocked: 01 a — needs a key\n/);

  // Resuming clears the block; done counts as before; only the last 10 events are kept.
  h.ok(root, 'ticket-start.js', ['1']);
  current = h.json(root, 'status.js').current;
  assert.deepStrictEqual([current.tickets[0].state, current.tickets[0].blocker], ['started', null]);
  assert.strictEqual(current.recentEvents[current.recentEvents.length - 1].event, 'ticket_resumed');
  h.completeTicket(root, 1, 'a');
  current = h.json(root, 'status.js').current;
  assert.deepStrictEqual(current.tickets.map((t) => t.state), ['done', 'pending']);
  for (let i = 0; i < 3; i += 1) {
    h.ok(root, 'ticket-start.js', ['2']);
    h.ok(root, 'ticket-block.js', ['2', '--reason', `try ${i}`]);
  }
  h.ok(root, 'ticket-start.js', ['2']);
  current = h.json(root, 'status.js').current;
  assert.deepStrictEqual(current.tickets.map((t) => t.state), ['done', 'started']);
  assert.ok(h.history(root).length > 10);
  assert.strictEqual(current.recentEvents.length, 10);
  assert.deepStrictEqual(current.recentEvents.map((e) => e.event), h.history(root).slice(-10).map((e) => e.event));
  const text = h.ok(root, 'status.js').out;
  assert.match(text, /\*\*Tickets:\*\* 1\/2 done; next 02 b/);
  assert.doesNotMatch(text, /Blocked/);
}

{
  // Scouted seeds but no session -> listed, and the first one is suggested.
  const root = h.tempProject();
  fs.mkdirSync(h.sessionsDir(root), { recursive: true });
  fs.writeFileSync(path.join(h.sessionsDir(root), '.pending-seeds.json'),
    JSON.stringify({ 'safe-linking': { strength: 'Strong', severity: 'Critical', problem: 'C1: data loss', solution: 's' } }));
  const report = h.json(root, 'status.js');
  assert.deepStrictEqual(report.seeds.map((i) => i.slug), ['safe-linking']);
  assert.strictEqual(report.suggestedNext.command, '/gps start safe-linking');
  const text = h.ok(root, 'status.js').out;
  assert.match(text, /## Scouted seeds not started/);
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

{
  // Status lists the unfinished sessions current in other worktrees.
  const root = h.gitProject('gps-st-wt-');
  h.ok(root, 'init.js', ['--apply']);
  h.ok(root, 'start.js', ['here']);
  const wt = h.json(root, 'start.js', ['there', '--worktree']).worktree;
  const otherSessionId = wt.sessionId || h.currentSession(wt.path);
  const report = h.json(root, 'status.js');
  assert.deepStrictEqual(report.worktrees.map((worktree) => worktree.sessionId), [otherSessionId]);
  const res = h.ok(root, 'status.js');
  assert.match(res.out, /## Sessions in other worktrees\n\n- \S+__there \(grill\) on feat\/there: .+\n/);
  assert.match(res.out, /Run gps commands for those sessions from their worktree\.\n\nNext: /);
  assert.doesNotMatch(h.ok(wt.path, 'status.js').out, /__there \(grill\) on/);
  fs.rmSync(path.dirname(wt.path), { recursive: true, force: true });
}

h.done('status.test.js');
