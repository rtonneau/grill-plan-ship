// tests/ticket-start.test.js — ticket-start.js (/gps ship: one ticket's workspace)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const h = require('./helpers');

{
  const root = h.gitProject();
  h.ok(root, 'start.js', ['tickets']);

  // No plan yet -> clear errors.
  h.assertFails(h.run(root, 'ticket-start.js', ['1']), 1, /grill phase is not written/);
  h.assertFails(h.run(root, 'ticket-start.js'), 1, /grill phase is not written/);
  h.writeGrill(root);
  h.ok(root, 'plan.js');
  h.assertFails(h.run(root, 'ticket-start.js', ['1']), 1, /\/gps write/);
  const prep = h.json(root, 'write-prepare.js');
  fs.writeFileSync(prep.payloadPath, h.planPayload(prep, [{ slug: 'a', model: 'sonnet' }, { slug: 'b' }]));
  h.ok(root, 'write-apply.js');

  // Invalid numbers.
  h.assertFails(h.run(root, 'ticket-start.js', ['abc']), 2, /Invalid ticket number/);
  h.assertFails(h.run(root, 'ticket-start.js', ['1', '2']), 2);
  h.assertFails(h.run(root, 'ticket-start.js', ['9']), 1, /Ticket 9 not found/);

  // No number -> the next pending ticket; "001" and "1" are the same ticket.
  let res = h.ok(root, 'ticket-start.js');
  assert.match(res.out, /TICKET 01: a \(model hint: sonnet\)/);
  assert.match(res.out, /Do a\./);
  assert.match(res.out, /Token usage phase key: 03-01-a/);
  assert.match(res.out, /Next: implement it[\s\S]*ticket-complete\.js 1 --message/);
  const log = path.join(h.sessionDir(root), '03-implement', '01-a', 'commit-log.md');
  assert.match(fs.readFileSync(log, 'utf-8'), /^# Ticket 01: a\n\n\*\*Status:\*\* In Progress/);
  assert.match(h.ok(root, 'ticket-start.js', ['001']).out, /existing log kept/);

  // ticket_started is recorded once, however often it runs.
  const started = h.history(root).filter((e) => e.event === 'ticket_started');
  assert.strictEqual(started.length, 1);
  assert.deepStrictEqual(started[0].detail, { ticket: '01-a' });
  assert.deepStrictEqual(started[0].files, ['02-plan/tickets/01-a.md', '03-implement/01-a/commit-log.md']);
  assert.ok(h.readConfig(root).usage['03-01-a'].startedAt);

  // An unfinished ticket keeps its log.
  fs.appendFileSync(log, '\nWORK IN PROGRESS NOTES\n');
  h.ok(root, 'ticket-start.js', ['1']);
  assert.match(fs.readFileSync(log, 'utf-8'), /WORK IN PROGRESS NOTES/);

  // A Done ticket is never reset; with no number the next one is picked.
  h.completeTicket(root, 1, 'a');
  const doneLog = fs.readFileSync(log, 'utf-8');
  res = h.ok(root, 'ticket-start.js', ['1']);
  assert.match(res.out, /already Done/);
  assert.strictEqual(fs.readFileSync(log, 'utf-8'), doneLog);
  assert.strictEqual(h.json(root, 'ticket-start.js').ticket.slug, 'b');

  // --mode is validated, then recorded as the session's last ship mode.
  h.assertFails(h.run(root, 'ticket-start.js', ['--mode', 'turbo']), 2, /--mode must be one of: inline, subagent, subagent\+inline/);
  assert.strictEqual(h.readConfig(root).ship_mode, undefined);
  h.ok(root, 'ticket-start.js', ['--mode', 'subagent+inline']);
  assert.strictEqual(h.readConfig(root).ship_mode, 'subagent+inline');
  h.ok(root, 'ticket-start.js', ['2', '--mode', 'inline']);
  assert.strictEqual(h.readConfig(root).ship_mode, 'inline');
  h.ok(root, 'ticket-start.js', ['2']);
  assert.strictEqual(h.readConfig(root).ship_mode, 'inline', 'no --mode keeps the recorded one');

  // All done -> says so.
  h.completeTicket(root, 2, 'b');
  assert.match(h.ok(root, 'ticket-start.js').out, /All tickets are done\. Next: \/gps finish/);
  assert.deepStrictEqual(h.json(root, 'ticket-start.js'), { sessionId: h.currentSession(root), ticket: null, allDone: true });
}

{
  // Duplicate numbers: all valid; the first not-done one (filename order) is picked.
  const root = h.gitProject();
  h.shipReady(root, 'dups', ['x']);
  const ticketsDir = path.join(h.sessionDir(root), '02-plan', 'tickets');
  fs.writeFileSync(path.join(ticketsDir, '01-y.md'), '# Ticket 01: y\n\nDo y.\n');
  assert.match(h.ok(root, 'ticket-start.js', ['1']).out, /Do x\./);
  h.completeTicket(root, 1, 'x');
  assert.match(h.ok(root, 'ticket-start.js', ['1']).out, /Do y\./);
}

{
  // A session from before scratch dirs gets one, with a warning.
  const root = h.gitProject();
  h.shipReady(root, 'old', ['a']);
  const config = h.readConfig(root);
  delete config.scratch_dir;
  fs.writeFileSync(h.configPath(root), JSON.stringify(config));
  const res = h.ok(root, 'ticket-start.js');
  assert.match(res.err, /predates scratch dirs/);
  assert.strictEqual(h.readConfig(root).scratch_dir, `.scratch/tests/${h.currentSession(root)}`);
}

h.done('ticket-start.test.js');
