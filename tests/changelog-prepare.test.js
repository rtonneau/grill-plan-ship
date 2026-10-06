// tests/changelog-prepare.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const h = require('./helpers');

// Session with a feat commit: floor minor, new format, gps commits excluded.
const root = h.gitProject('gps-clp-');
h.shipReady(root, 'Add thing', ['a']);
h.completeTicket(root, 1, 'a');
const data = h.json(root, 'changelog-prepare.js');
assert.strictEqual(data.enabled, true);
assert.strictEqual(data.path, 'CHANGELOG.md');
assert.strictEqual(data.format, 'new');
assert.strictEqual(data.floor, 'minor');
assert.strictEqual(data.rerun, false);
assert.ok(data.commits.includes('feat: a'));
assert.ok(data.commits.every((c) => !/^(chore\(gps\):|docs\(changelog\):)/.test(c)));
assert.strictEqual(data.payloadPath, path.join(h.sessionDir(root), '.changelog-payload.md'));
const first = h.ok(root, 'changelog-prepare.js');
assert.match(first.out, /Next:/);
assert.doesNotMatch(first.err, /git-ignored/, 'no warning when .work/ is committed');

// Disabled.
fs.writeFileSync(path.join(root, '.work', 'gps-config.json'), JSON.stringify({ github: { enabled: false }, changelog: { enabled: false } }));
const off = h.json(root, 'changelog-prepare.js');
assert.strictEqual(off.enabled, false);
assert.match(h.ok(root, 'changelog-prepare.js').out, /Changelog disabled \(changelog\.enabled = false\)\.[\s\S]*Next: finish\.js/);

// Refuses: grill not written.
const early = h.gitProject('gps-clp2-');
h.ok(early, 'start.js', ['Early']);
h.assertFails(h.run(early, 'changelog-prepare.js'), 1, /grill phase is not written yet/);

// Refuses: finished session.
const fin = h.gitProject('gps-clp3-');
h.ok(fin, 'start.js', ['Fin']);
h.writeGrill(fin);
const sid = h.currentSession(fin);
h.ok(fin, 'finish.js');
fs.writeFileSync(path.join(h.sessionsDir(fin), '.current-session'), sid);
h.assertFails(h.run(fin, 'changelog-prepare.js'), 1, /already finished/);

// .work/ git-ignored: a warning, the fragment would stay on this machine.
{
  const r = h.gitProject('gps-clp4-');
  fs.writeFileSync(path.join(r, '.gitignore'), '.work/\n');
  h.git(r, 'add', '.gitignore');
  h.git(r, 'commit', '-q', '-m', 'ignore .work');
  h.shipReady(r, 'Ignored', ['a']);
  h.completeTicket(r, 1, 'a');
  const res = h.ok(r, 'changelog-prepare.js');
  assert.ok(res.err.includes(".work/ is git-ignored: the changelog fragment stays on this machine; other clones won't see it until it is committed."));
  assert.strictEqual(res.err.split('\n').filter((l) => /git-ignored/.test(l)).length, 1);
}

h.done('changelog-prepare.test.js');
