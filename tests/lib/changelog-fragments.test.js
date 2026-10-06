// tests/lib/changelog-fragments.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  FRAGMENTS_DIR, fragmentPath, serializeFragment, parseFragment, listFragments, writeFragment, deleteFragments,
} = require('../../skills/gps/scripts/lib/changelog-fragments');

assert.strictEqual(FRAGMENTS_DIR, '.work/changelog');

// round trips
const bodies = ['- plain bullet', '- a\n  - b', '### Added\n- x\n\n### Fixed\n- y'];
for (const body of bodies) {
  for (const reason of [null, 'breaking CLI flag']) {
    const f = { bump: 'minor', floor: 'patch', reason, body };
    const text = serializeFragment(f);
    assert.ok(text.endsWith('\n') && !text.endsWith('\n\n'));
    assert.deepStrictEqual(parseFragment(text), f);
  }
}
assert.ok(!serializeFragment({ bump: 'patch', floor: 'patch', reason: '', body: '- x' }).includes('reason'));
assert.deepStrictEqual(
  parseFragment(serializeFragment({ bump: 'patch', floor: 'patch', reason: '', body: '- x' })).reason, null);
assert.throws(() => serializeFragment({ bump: 'patch', floor: 'patch', reason: 'a\nb', body: '- x' }), /reason/);

// CRLF
const lf = serializeFragment({ bump: 'major', floor: 'minor', reason: 'r', body: '- a\n  - b' });
assert.deepStrictEqual(parseFragment(lf.replace(/\n/g, '\r\n')), parseFragment(lf));

// errors
assert.throws(() => parseFragment('- x\n'), /missing front matter/);
assert.throws(() => parseFragment('---\nbump: huge\nfloor: patch\n---\n- x\n'), /bump "huge" is not patch, minor or major/);
assert.throws(() => parseFragment('---\nbump: patch\n---\n- x\n'), /missing floor/);
assert.throws(() => parseFragment('---\nbump: patch\nfloor: patch\n---\n\n'), /empty body/);

// files
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-frag-'));
assert.deepStrictEqual(listFragments(root), []);
const dir = path.join(root, '.work', 'changelog');
assert.strictEqual(fragmentPath(root, 'S1'), path.join(dir, 'S1.md'));
const mk = (b) => ({ bump: b, floor: 'patch', reason: null, body: `- ${b}` });
assert.strictEqual(writeFragment(root, '2026-10-06__b', mk('minor')), '.work/changelog/2026-10-06__b.md');
writeFragment(root, '2026-10-05__a', mk('patch'));
fs.writeFileSync(path.join(dir, '.gitkeep'), '');
fs.writeFileSync(path.join(dir, 'notes.txt'), 'x');
fs.writeFileSync(path.join(dir, 'x.md~'), 'x');
const listed = listFragments(root);
assert.deepStrictEqual(listed.map((e) => e.sessionId), ['2026-10-05__a', '2026-10-06__b']);
assert.strictEqual(listed[0].file, '.work/changelog/2026-10-05__a.md');
assert.strictEqual(listed[0].bump, 'patch');

writeFragment(root, '2026-10-05__a', mk('major'));
assert.strictEqual(fs.readdirSync(dir).filter((n) => n.startsWith('2026-10-05__a')).length, 1);
assert.strictEqual(listFragments(root)[0].bump, 'major');

fs.writeFileSync(path.join(dir, '2026-10-05__bad.md'), 'nope');
assert.throws(() => listFragments(root), (e) => e.message.startsWith('.work/changelog/2026-10-05__bad.md'));

deleteFragments(root, ['.work/changelog/2026-10-05__bad.md', '.work/changelog/missing.md']);
assert.ok(!fs.existsSync(path.join(dir, '2026-10-05__bad.md')));
fs.rmSync(root, { recursive: true, force: true });

console.log('changelog-fragments.test.js: all assertions passed');
