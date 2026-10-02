// tests/help.test.js — help.js (/gps help [command])
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const h = require('./helpers');

{
  // No session at all: still works, lists every command and points at /gps start.
  const root = h.tempProject();
  const res = h.ok(root, 'help.js');
  assert.match(res.out, /## Where you are\n\nNo session yet\./);
  assert.match(res.out, /## The workflow/);
  for (const name of ['init', 'scout', 'start', 'status', 'clean', 'config', 'write', 'plan', 'ship', 'finish', 'auto', 'handoff', 'help']) {
    assert.match(res.out, new RegExp(`^\\| \`/gps ${name}\\b`, 'm'), `help lists /gps ${name}`);
  }
  // The table cell of /gps auto keeps its pipes escaped.
  assert.match(res.out, /\| `\/gps auto \[--delegate\] \[plan\\\|ship\\\|finish\]` \| You trust the direction/);
  assert.match(res.out, /Next: \/gps start <feature-name>/);
  assert.ok(!fs.existsSync(path.join(root, '.work')), 'help.js creates nothing');

  const data = h.json(root, 'help.js');
  assert.strictEqual(data.sessionId, null);
  assert.strictEqual(data.suggestedNext.command, '/gps start <feature-name>');
  const ship = data.commands.find((c) => c.name === 'ship');
  assert.strictEqual(ship.usage, '/gps ship [N]');
  assert.match(ship.when, /the tickets are approved/);
  assert.match(ship.examples, /`\/gps ship 3`/);

  // One command, named bare or as typed.
  for (const arg of ['ship', '/gps ship', 'SHIP']) {
    const one = h.ok(root, 'help.js', [arg]).out;
    assert.match(one, /^## \/gps ship \[N\]/);
    assert.match(one, /\*\*When:\*\* the tickets are approved/);
    assert.match(one, /\*\*Examples:\*\* `\/gps ship`/);
  }
  assert.strictEqual(h.json(root, 'help.js', ['auto']).command.usage, '/gps auto [--delegate] [plan|ship|finish]');

  h.assertFails(h.run(root, 'help.js', ['bogus']), 2, /Unknown command "bogus"[\s\S]*Commands: init, scout, start/);
  h.assertFails(h.run(root, 'help.js', ['a', 'b']), 2, /Unexpected argument/);
}

{
  // A git repo whose gps setup is not committed: help points at /gps init first.
  const root = h.gitProject();
  const res = h.ok(root, 'help.js');
  assert.match(res.out, /No session yet, and gps is not set up in this repository \(optional: \/gps init\)/);
  assert.match(res.out, /Next: \/gps init — /);
  h.ok(root, 'init.js', ['--apply']);
  assert.match(h.ok(root, 'help.js').out, /Next: \/gps start <feature-name>/);
}

{
  // With a session: the phase and next command follow it, and help never writes.
  const root = h.gitProject();
  h.ok(root, 'start.js', ['dark-mode']);
  const before = fs.readFileSync(h.configPath(root), 'utf-8');
  let data = h.json(root, 'help.js');
  assert.strictEqual(data.sessionId, h.currentSession(root));
  assert.strictEqual(data.phase, 'grill');
  assert.strictEqual(data.suggestedNext.command, '/gps write');
  assert.match(h.ok(root, 'help.js').out, /\*\*Phase:\*\* Grill: the design is being discussed/);
  assert.match(h.ok(root, 'help.js', ['plan']).out, /\*\*Right now:\*\* phase grill; the next command is `\/gps write`\./);
  assert.strictEqual(fs.readFileSync(h.configPath(root), 'utf-8'), before, 'help.js modified the session');

  h.writeGrill(root);
  h.writePlan(root, ['a']);
  data = h.json(root, 'help.js');
  assert.strictEqual(data.phase, 'ship');
  assert.strictEqual(data.suggestedNext.command, '/gps ship');

  // A pointer to a missing session: explained, and status suggested.
  fs.writeFileSync(path.join(h.sessionsDir(root), '.current-session'), 'gone');
  const res = h.ok(root, 'help.js');
  assert.match(res.out, /⚠️ The current session gone no longer exists/);
  assert.match(res.out, /Next: \/gps status/);
}

console.log('help.test.js: all assertions passed');
