// tests/changelog-apply.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const h = require('./helpers');

const root = h.gitProject('gps-cla-');
h.shipReady(root, 'Add thing', ['a']);
h.completeTicket(root, 1, 'a');
const prep = h.json(root, 'changelog-prepare.js');
const changelog = path.join(root, 'CHANGELOG.md');
const sid = h.currentSession(root);

// Missing payload.
h.assertFails(h.run(root, 'changelog-apply.js', ['--bump', 'minor']), 1, /payload/i);
// Bad level.
fs.writeFileSync(prep.payloadPath, '- Thing added\n');
h.assertFails(h.run(root, 'changelog-apply.js', ['--bump', 'huge']), 2);
// Below floor.
h.assertFails(h.run(root, 'changelog-apply.js', ['--bump', 'patch']), 1, /below the floor "minor"/);
assert.ok(!fs.existsSync(changelog));
// Above floor, no reason.
h.assertFails(h.run(root, 'changelog-apply.js', ['--bump', 'major']), 1, /--reason/);
assert.ok(!fs.existsSync(changelog));
// Invalid payload.
fs.writeFileSync(prep.payloadPath, 'not a bullet\n');
h.assertFails(h.run(root, 'changelog-apply.js', ['--bump', 'minor']), 2);
assert.ok(!fs.existsSync(changelog));

// Success.
fs.writeFileSync(prep.payloadPath, '- Thing added\n');
const res = h.ok(root, 'changelog-apply.js', ['--bump', 'major', '--reason', 'removes x']);
assert.match(res.out, /📝 CHANGELOG\.md: major \(1 bullet\(s\)\) committed \([0-9a-f]+\)[\s\S]*Next: finish\.js/);
assert.strictEqual(h.git(root, 'log', '-1', '--format=%s'), 'docs(changelog): Add thing');
const body = fs.readFileSync(changelog, 'utf-8');
assert.ok(body.includes(`<!-- gps:bump=major session=${sid} -->`));
const cfg = h.readConfig(root).changelog;
assert.strictEqual(cfg.bump, 'major');
assert.strictEqual(cfg.floor, 'minor');
assert.strictEqual(cfg.reason, 'removes x');
assert.strictEqual(cfg.bullets, 1);
assert.strictEqual(cfg.path, 'CHANGELOG.md');
assert.ok(cfg.written_at);
assert.ok(h.history(root).some((e) => e.event === 'changelog_written'));
assert.ok(!fs.existsSync(prep.payloadPath));

// Re-run: one marker line.
assert.strictEqual(h.json(root, 'changelog-prepare.js').rerun, true);
fs.writeFileSync(prep.payloadPath, '- Thing added, better\n');
h.ok(root, 'changelog-apply.js', ['--bump', 'minor']);
const again = fs.readFileSync(changelog, 'utf-8');
assert.strictEqual(again.split('\n').filter((l) => l.includes('gps:bump=')).length, 1);
assert.ok(again.includes('better') && !again.includes('Thing added <!--'));

// Disabled refuses.
fs.writeFileSync(path.join(root, '.work', 'gps-config.json'), JSON.stringify({ github: { enabled: false }, changelog: { enabled: false } }));
fs.writeFileSync(prep.payloadPath, '- x\n');
h.assertFails(h.run(root, 'changelog-apply.js', ['--bump', 'minor']), 1, /disabled/);

// No git: the file is written, the commit failure is a warning.
const plain = h.tempProject('gps-cla2-');
h.shipReady(plain, 'No git', ['a']);
const p2 = h.json(plain, 'changelog-prepare.js');
assert.deepStrictEqual(p2.commits, []);
fs.writeFileSync(p2.payloadPath, '- Something\n');
const ng = h.ok(plain, 'changelog-apply.js', ['--bump', 'patch']);
assert.match(ng.err, /not committed.*git add -- .*git commit -m/);
assert.ok(fs.existsSync(path.join(plain, 'CHANGELOG.md')));
assert.strictEqual(h.readConfig(plain).changelog.bump, 'patch');

h.done('changelog-apply.test.js');

// Identical re-run: no false warning, still one docs(changelog) commit.
{
  const r = h.gitProject('gps-cla3-');
  h.shipReady(r, 'Twice', ['a']);
  h.completeTicket(r, 1, 'a');
  const p = h.json(r, 'changelog-prepare.js');
  fs.writeFileSync(p.payloadPath, '- Same\n');
  h.ok(r, 'changelog-apply.js', ['--bump', 'minor']);
  fs.writeFileSync(p.payloadPath, '- Same\n');
  const second = h.ok(r, 'changelog-apply.js', ['--bump', 'minor']);
  assert.doesNotMatch(second.err, /⚠️/);
  assert.match(second.out, /unchanged[\s\S]*Next: finish\.js/);
  assert.strictEqual(h.git(r, 'log', '--format=%s').split('\n').filter((s) => s.startsWith('docs(changelog):')).length, 1);
  assert.ok(!fs.existsSync(p.payloadPath));
}

// Unknown format warns.
{
  const r = h.gitProject('gps-cla4-');
  h.shipReady(r, 'Odd', ['a']);
  h.completeTicket(r, 1, 'a');
  fs.writeFileSync(path.join(r, 'CHANGELOG.md'), 'just some notes\n');
  h.git(r, 'add', 'CHANGELOG.md');
  h.git(r, 'commit', '-q', '-m', 'notes');
  const p = h.json(r, 'changelog-prepare.js');
  assert.strictEqual(p.format, 'unknown');
  fs.writeFileSync(p.payloadPath, '- Odd\n');
  const res = h.ok(r, 'changelog-apply.js', ['--bump', 'minor']);
  assert.match(res.err, /Unrecognised CHANGELOG\.md structure: check the result\./);
}
h.done('changelog-apply.test.js (fix round 1)');
