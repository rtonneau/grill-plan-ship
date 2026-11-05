// tests/adaptive-flow.test.js
//
// The two sizes of work and the recoveries the references rely on, through the
// real scripts: small work finishes with no plan or tickets; a planned session
// survives a blocked ticket, a resume, and a stored pre-3.0 ship mode.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const h = require('./helpers');

// Small: grill resume, one commit, finish. No plan, ticket, branch or PR.
{
  const root = h.gitProject();
  h.ok(root, 'start.js', ['fix typo']);
  h.writeGrill(root);
  fs.writeFileSync(path.join(root, 'app.js'), 'console.log(2);\n');
  h.git(root, 'add', 'app.js');
  h.git(root, 'commit', '-q', '-m', 'fix: typo');
  const dir = h.sessionDir(root);
  const finished = h.ok(root, 'finish.js', ['--title', 'Fix typo']);
  assert.match(finished.out, /Session complete/);
  assert.ok(!fs.existsSync(path.join(dir, '02-plan', 'tickets', '01-x.md')));
  assert.match(fs.readFileSync(path.join(dir, 'INDEX.md'), 'utf-8'), /bounded: no plan or tickets/);
  assert.strictEqual(h.git(root, 'branch', '--show-current'), 'main');
  assert.strictEqual(h.git(root, "status", "--porcelain", "--", ".work"), "", "the session record is committed");
}

// Planned, delegated: a blocked ticket can be resumed and completed by the parent.
{
  const root = h.gitProject();
  h.shipReady(root, 'recovery', [{ slug: 'a', model: 'heavy', effort: 'high' }, { slug: 'b' }]);
  h.ok(root, 'ticket-start.js', ['1', '--mode', 'delegate']);
  const first = h.json(root, 'dispatch-prompt.js', ['1']);
  assert.strictEqual(first.call.model, 'opus');

  // The child reports BLOCKED; the parent records it, which keeps the ticket pending.
  h.ok(root, 'ticket-block.js', ['1', '--reason', 'needs a stronger model']);
  assert.strictEqual(h.json(root, 'ticket-queue.js').nextPending.slug, 'a');

  // A fresh dispatch is allowed on the same workspace; the log is kept, not reset.
  const log = path.join(h.sessionDir(root), '03-implement', '01-a', 'commit-log.md');
  const logged = fs.readFileSync(log, 'utf-8');
  const resumed = h.json(root, 'ticket-start.js', ['1']);
  assert.strictEqual(resumed.logExisted, true);
  assert.strictEqual(fs.readFileSync(log, 'utf-8'), logged);
  assert.strictEqual(h.json(root, 'dispatch-prompt.js', ['1', '--model', 'heavy', '--effort', 'xhigh']).call.effort, 'xhigh');

  // The child's changes stay unstaged; only the parent commits.
  fs.writeFileSync(path.join(root, 'a.js'), 'a\n');
  assert.match(h.git(root, 'status', '--porcelain', '--', 'a.js'), /^\?\? a\.js$/);
  h.completeTicket(root, 1, 'a');
  assert.strictEqual(h.json(root, 'ticket-queue.js').nextPending.slug, 'b');
}

// A session stopped mid-ship under a pre-3.0 mode resumes unchanged.
{
  const root = h.gitProject();
  h.shipReady(root, 'legacy', ['a', 'b']);
  h.ok(root, 'ticket-start.js', ['1', '--mode', 'inline']);
  h.completeTicket(root, 1, 'a');
  const cfgPath = path.join(h.sessionDir(root), '.session-config.json');
  fs.writeFileSync(cfgPath, JSON.stringify({ ...JSON.parse(fs.readFileSync(cfgPath, 'utf-8')), ship_mode: 'subagent+inline' }));
  const queue = h.json(root, 'ticket-queue.js');
  assert.strictEqual(queue.shipMode, 'delegate');
  assert.strictEqual(queue.nextPending.slug, 'b');
  h.ok(root, 'ticket-start.js', ['2']);
  assert.strictEqual(h.json(root, 'dispatch-prompt.js', ['2']).call.subagent_type, 'general-purpose');
  h.completeTicket(root, 2, 'b');
  assert.match(h.ok(root, 'ticket-start.js').out, /All tickets are done/);
  assert.match(h.ok(root, 'finish.js', ['--title', 'Legacy']).out, /Session complete/);
}

// The last ticket's output decides the chain: on by default, off by config.
{
  const root = h.gitProject();
  h.shipReady(root, 'chain', ['a']);
  h.ok(root, 'ticket-start.js', ['1']);
  h.fillLog(root, '01-a');
  fs.writeFileSync(path.join(root, 'a.js'), 'a\n');
  const last = h.ok(root, 'ticket-complete.js', ['1', '--message', 'feat: a', '--file', 'a.js']);
  assert.match(last.out, /every ticket is done: \/gps finish \(ship\.autoFinish is on/);
  assert.match(h.ok(root, 'ticket-queue.js').out, /All tickets are done\. Next: \/gps finish \(ship\.autoFinish is on/);
  const file = path.join(root, '.work', 'gps-config.json');
  fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf-8')), ship: { autoFinish: false } }));
  assert.match(h.ok(root, 'ticket-start.js').out, /All tickets are done\. Next: \/gps finish$/m);
}

h.done('adaptive-flow.test.js');
