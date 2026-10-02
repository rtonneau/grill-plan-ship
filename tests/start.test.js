// tests/start.test.js — start.js (/gps start [--issue])
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const h = require('./helpers');

{
  // Creates the session, its scratch dir, the .scratch/ .gitignore entry and the pointer; .work/ is not ignored.
  const root = h.tempProject();
  const res = h.ok(root, 'start.js', ['feat']);
  assert.match(res.out, /✅ Session started: \d{4}-\d{2}-\d{2}__feat\n/);
  assert.match(res.out, /\nNext: run the grill/);
  const id = h.currentSession(root);
  assert.match(id, /^\d{4}-\d{2}-\d{2}__feat$/);
  assert.ok(fs.existsSync(path.join(root, '.scratch', 'tests', id)));
  const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf-8');
  assert.doesNotMatch(gitignore, /^\.work\/$/m);
  assert.match(gitignore, /^\.scratch\/$/m);
  assert.deepStrictEqual(fs.readdirSync(h.sessionDir(root)).sort(), ['.session-config.json', '01-grill']);
  assert.deepStrictEqual(h.history(root).map((e) => [e.event, e.phase]), [['session_started', 'grill']]);
  assert.strictEqual(h.readConfig(root).current_phase, 'grill');
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(root, '.work', 'gps-config.json'), 'utf-8')).github.enabled, false);

  // Re-running never touches the existing session.
  const resume = path.join(h.sessionDir(root), '01-grill', 'resume.md');
  fs.writeFileSync(resume, 'FILLED');
  const before = fs.readFileSync(h.configPath(root), 'utf-8');
  h.assertFails(h.run(root, 'start.js', ['feat']), 1, /already exists/);
  assert.strictEqual(fs.readFileSync(resume, 'utf-8'), 'FILLED');
  assert.strictEqual(fs.readFileSync(h.configPath(root), 'utf-8'), before);
}

{
  // Names are cleaned to slugs that stay inside .work/sessions.
  const root = h.tempProject();
  const target = `escaped-${process.pid}-${Date.now()}`;
  const res = h.ok(root, 'start.js', [`x/../../../../${target}`]);
  assert.match(res.out, new RegExp(`cleaned to "x-${target}"`));
  assert.ok(fs.existsSync(path.join(h.sessionDir(root), '.session-config.json')));
  assert.ok(!fs.existsSync(path.join(root, '..', target)));
  h.ok(root, 'start.js', ['a:b?c']);
  assert.match(h.currentSession(root), /__a-b-c$/);
  h.ok(root, 'start.js', ['!!!']);
  assert.match(h.currentSession(root), /__untitled-\d{6}$/);
  // Words are joined, so an unquoted name works.
  h.ok(root, 'start.js', ['Add', 'Dark', 'Mode']);
  assert.match(h.currentSession(root), /__add-dark-mode$/);
}

{
  // Usage errors: exit 2, nothing created.
  const root = h.tempProject();
  h.assertFails(h.run(root, 'start.js'), 2, /Usage: start\.js/);
  h.assertFails(h.run(root, 'start.js', ['   ']), 2, /Missing feature name/);
  h.assertFails(h.run(root, 'start.js', ['x', '--bogus']), 2, /Unknown option: --bogus/);
  assert.ok(!fs.existsSync(path.join(root, '.work')));
}

{
  // --issue: kind "issue"; local (with a warning) when GitHub is off.
  const root = h.tempProject();
  const res = h.ok(root, 'start.js', ['--issue', 'Crash', 'on', 'save']);
  assert.match(res.out, /\(issue\)/);
  assert.match(res.err, /⚠️ {2}GitHub is not enabled for this project/);
  const config = h.readConfig(root);
  assert.strictEqual(config.kind, 'issue');
  assert.strictEqual(config.feature_name, 'Crash on save');
  assert.deepStrictEqual(config.history.map((e) => [e.event, e.detail]), [['session_started', { kind: 'issue' }]]);
}

{
  // A matching scout seed is printed and consumed; --json carries the data.
  const root = h.tempProject();
  fs.mkdirSync(h.sessionsDir(root), { recursive: true });
  const seeds = path.join(h.sessionsDir(root), '.pending-seeds.json');
  fs.writeFileSync(seeds, JSON.stringify({
    'safe-linking': { strength: 'Strong', severity: 'Critical', problem: 'C1: p', solution: 's', sourceReport: 'scout-reports/r.md' },
    other: { strength: 'Speculative', problem: 'p', solution: 's' },
  }));
  const res = h.ok(root, 'start.js', ['safe-linking']);
  assert.match(res.out, /Scout seed for "safe-linking" \(from scout-reports\/r\.md\)/);
  assert.match(res.out, /"severity": "Critical"/);
  assert.deepStrictEqual(Object.keys(JSON.parse(fs.readFileSync(seeds, 'utf-8'))), ['other']);

  const data = h.json(root, 'start.js', ['brand new']);
  assert.strictEqual(data.seed, null);
  assert.strictEqual(data.kind, 'feature');
  assert.match(data.sessionId, /__brand-new$/);
}

h.done('start.test.js');
