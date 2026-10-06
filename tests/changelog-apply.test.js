// tests/changelog-apply.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const h = require('./helpers');
const { parseFragment } = require('../skills/gps/scripts/lib/changelog-fragments');

const root = h.gitProject('gps-cla-');
h.shipReady(root, 'Add thing', ['a']);
h.completeTicket(root, 1, 'a');
const prep = h.json(root, 'changelog-prepare.js');
const changelog = path.join(root, 'CHANGELOG.md');
const sid = h.currentSession(root);
const fragmentRel = `.work/changelog/${sid}.md`;
const fragment = path.join(root, '.work', 'changelog', `${sid}.md`);
const fragmentsDir = path.join(root, '.work', 'changelog');
const noFragment = () => assert.ok(!fs.existsSync(fragmentsDir) || fs.readdirSync(fragmentsDir).length === 0, 'no fragment written');

// Missing payload.
h.assertFails(h.run(root, 'changelog-apply.js', ['--bump', 'minor']), 1, /payload/i);
// Bad level.
fs.writeFileSync(prep.payloadPath, '- Thing added\n');
h.assertFails(h.run(root, 'changelog-apply.js', ['--bump', 'huge']), 2);
// Below floor.
h.assertFails(h.run(root, 'changelog-apply.js', ['--bump', 'patch']), 1, /below the floor "minor"/);
noFragment();
// Above floor, no reason.
h.assertFails(h.run(root, 'changelog-apply.js', ['--bump', 'major']), 1, /--reason/);
noFragment();
// Invalid payload.
fs.writeFileSync(prep.payloadPath, 'not a bullet\n');
h.assertFails(h.run(root, 'changelog-apply.js', ['--bump', 'minor']), 2);
noFragment();

// Success: a fragment, CHANGELOG.md untouched, no commit.
const headBefore = h.git(root, 'rev-parse', 'HEAD');
fs.writeFileSync(prep.payloadPath, '- Thing added\n');
const res = h.ok(root, 'changelog-apply.js', ['--bump', 'major', '--reason', 'removes x']);
assert.strictEqual(res.out.trim(), `📝 Changelog fragment: major (1 bullet(s)) → ${fragmentRel}\nNext: finish.js`);
assert.ok(!fs.existsSync(changelog), 'CHANGELOG.md is never written at finish');
assert.strictEqual(h.git(root, 'rev-parse', 'HEAD'), headBefore, 'no commit');
assert.ok(!h.git(root, 'log', '--format=%s').split('\n').some((s) => s.startsWith('docs(changelog)')));
const parsed = parseFragment(fs.readFileSync(fragment, 'utf-8'));
assert.deepStrictEqual(parsed, { bump: 'major', floor: 'minor', reason: 'removes x', body: '- Thing added' });
const cfg = h.readConfig(root).changelog;
assert.strictEqual(cfg.bump, 'major');
assert.strictEqual(cfg.floor, 'minor');
assert.strictEqual(cfg.reason, 'removes x');
assert.strictEqual(cfg.bullets, 1);
assert.strictEqual(cfg.path, fragmentRel);
assert.ok(cfg.written_at);
assert.ok(h.history(root).some((e) => e.event === 'changelog_written'));
assert.ok(!fs.existsSync(prep.payloadPath));

// Re-run: still one fragment, the new body.
assert.strictEqual(h.json(root, 'changelog-prepare.js').rerun, true);
fs.writeFileSync(prep.payloadPath, '- Thing added, better\n  - nested\n');
h.ok(root, 'changelog-apply.js', ['--bump', 'minor']);
assert.deepStrictEqual(fs.readdirSync(fragmentsDir), [`${sid}.md`]);
assert.deepStrictEqual(parseFragment(fs.readFileSync(fragment, 'utf-8')),
  { bump: 'minor', floor: 'minor', reason: null, body: '- Thing added, better\n  - nested' });
assert.ok(!fs.existsSync(changelog));

// Sections format: the body is kept as Claude wrote it.
fs.writeFileSync(changelog, '# Changelog\n\n## [1.0.0] - 2026-01-01\n\n### Added\n\n- first\n');
h.git(root, 'add', 'CHANGELOG.md');
h.git(root, 'commit', '-q', '-m', 'docs: keep a changelog');
const before = fs.readFileSync(changelog, 'utf-8');
fs.writeFileSync(prep.payloadPath, '- plain\n');
h.assertFails(h.run(root, 'changelog-apply.js', ['--bump', 'minor']), 2);
fs.writeFileSync(prep.payloadPath, '### Added\n- Thing\n');
h.ok(root, 'changelog-apply.js', ['--bump', 'minor']);
assert.strictEqual(parseFragment(fs.readFileSync(fragment, 'utf-8')).body, '### Added\n- Thing');
assert.strictEqual(fs.readFileSync(changelog, 'utf-8'), before, 'CHANGELOG.md untouched');

// Disabled refuses, the fragment is left as it was.
const kept = fs.readFileSync(fragment, 'utf-8');
fs.writeFileSync(path.join(root, '.work', 'gps-config.json'), JSON.stringify({ github: { enabled: false }, changelog: { enabled: false } }));
fs.writeFileSync(prep.payloadPath, '### Added\n- x\n');
h.assertFails(h.run(root, 'changelog-apply.js', ['--bump', 'minor']), 1, /disabled/);
assert.strictEqual(fs.readFileSync(fragment, 'utf-8'), kept);

// No git: the fragment is written all the same.
const plain = h.tempProject('gps-cla2-');
h.shipReady(plain, 'No git', ['a']);
const p2 = h.json(plain, 'changelog-prepare.js');
assert.deepStrictEqual(p2.commits, []);
fs.writeFileSync(p2.payloadPath, '- Something\n');
const ng = h.ok(plain, 'changelog-apply.js', ['--bump', 'patch']);
assert.doesNotMatch(ng.err, /⚠️/);
assert.ok(fs.existsSync(path.join(plain, '.work', 'changelog', `${h.currentSession(plain)}.md`)));
assert.ok(!fs.existsSync(path.join(plain, 'CHANGELOG.md')));
assert.strictEqual(h.readConfig(plain).changelog.bump, 'patch');

h.done('changelog-apply.test.js');

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
  const out = h.ok(r, 'changelog-apply.js', ['--bump', 'minor']);
  assert.match(out.err, /Unrecognised CHANGELOG\.md structure/);
  assert.strictEqual(fs.readFileSync(path.join(r, 'CHANGELOG.md'), 'utf-8'), 'just some notes\n');
}

// Two session branches from the same main, each finished with a fragment:
// merging both into main never conflicts, and both fragments are there.
{
  const r = h.gitProject('gps-cla-merge-');
  // gps's one-time setup (.gitignore, project config) lands on main first.
  h.ok(r, 'init.js', ['--apply']);
  assert.strictEqual(h.git(r, 'status', '--porcelain'), '');
  const finishOn = (branch, name) => {
    h.git(r, 'switch', '-q', 'main');
    h.git(r, 'switch', '-q', '-c', branch);
    h.shipReady(r, name, ['a']);
    h.ok(r, 'ticket-start.js', ['1']);
    h.fillLog(r, '01-a');
    fs.writeFileSync(path.join(r, `${branch}.js`), `// ${branch}\n`);
    h.ok(r, 'ticket-complete.js', ['1', '--message', `feat: ${name}`, '--file', `${branch}.js`]);
    const p = h.json(r, 'changelog-prepare.js');
    fs.writeFileSync(p.payloadPath, `- ${name}\n`);
    h.ok(r, 'changelog-apply.js', ['--bump', 'minor']);
    const id = h.currentSession(r);
    h.ok(r, 'finish.js');
    assert.strictEqual(h.git(r, 'status', '--porcelain'), '', `${branch}: tree clean after finish`);
    return id;
  };
  const a = finishOn('A', 'Session A');
  const b = finishOn('B', 'Session B');
  h.git(r, 'switch', '-q', 'main');
  h.git(r, 'merge', '-q', '--no-edit', 'A');
  h.git(r, 'merge', '-q', '--no-edit', 'B');
  assert.deepStrictEqual(fs.readdirSync(path.join(r, '.work', 'changelog')).sort(), [`${a}.md`, `${b}.md`].sort());
  assert.ok(!fs.existsSync(path.join(r, 'CHANGELOG.md')));
  // The release holds both sessions' entries, in session order.
  h.ok(r, 'release.js', ['--version', '0.1.0']);
  const log = fs.readFileSync(path.join(r, 'CHANGELOG.md'), 'utf-8');
  assert.match(log, /^## 0\.1\.0 \(\d{4}-\d{2}-\d{2}\)\n\n- Session A\n- Session B\n/m);
  assert.deepStrictEqual(fs.readdirSync(path.join(r, '.work', 'changelog')), []);
  assert.strictEqual(h.git(r, 'status', '--porcelain'), '');
}
h.done('changelog-apply.test.js (merge)');
