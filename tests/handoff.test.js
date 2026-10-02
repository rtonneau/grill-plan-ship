// tests/handoff.test.js — handoff.js (/gps handoff)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const h = require('./helpers');

const root = h.gitProject();
h.assertFails(h.run(root, 'handoff.js'), 1, /No sessions found/);
h.shipReady(root, 'checkpoint', ['a', 'b']);
h.completeTicket(root, 1, 'a');
fs.writeFileSync(path.join(root, '.gitignore'), '.work/\n.scratch/\n');
h.git(root, 'add', '.gitignore');
h.git(root, 'commit', '-q', '-m', 'chore: ignore');

// Clean tree: "Why not committed" is pre-filled with n/a.
let res = h.ok(root, 'handoff.js');
const handoffPath = path.join(h.sessionDir(root), 'HANDOFF.md');
assert.match(res.out, /✅ Handoff saved: .*HANDOFF\.md/);
assert.match(res.out, /Phase ship, active ticket 02-b, git clean\./);
assert.match(res.out, /Next: replace the gps:fill markers of these sections in HANDOFF\.md \(Edit\): Where I Stopped, Reasoning So Far, Next Step, Open Questions, Settled Decisions\./);
let text = fs.readFileSync(handoffPath, 'utf-8');
assert.match(text, /\*\*Current phase:\*\* ship/);
assert.match(text, /\*\*Active ticket:\*\* 02-b/);
assert.match(text, /\*\*Why not committed:\*\* n\/a/);
assert.match(text, /\*\*Ticket queue:\*\* 01-a: done, 02-b: pending/);
assert.match(text, /\*\*Recent commits:\*\* .*feat: a/);
assert.doesNotMatch(text, /\{\{/);
assert.deepStrictEqual(h.history(root).pop().files, ['HANDOFF.md']);

// Uncommitted work: listed, and its reason is asked for. Each run overwrites the file.
fs.writeFileSync(path.join(root, 'wip.js'), '// uncommitted\n');
const data = h.json(root, 'handoff.js');
assert.ok(data.gitStatus.project.some((e) => e.path === 'wip.js'));
assert.deepStrictEqual(data.toFill.slice(-1), ['Why not committed']);
assert.strictEqual(data.activeTicket, '02-b');
text = fs.readFileSync(handoffPath, 'utf-8');
assert.match(text, /\*\*Git status \(project\):\*\* \?\? wip\.js/);
assert.match(text, /\*\*Why not committed:\*\* <!-- gps:fill/);
assert.strictEqual(h.history(root).filter((e) => e.event === 'handoff_saved').length, 2);

h.done('handoff.test.js');
