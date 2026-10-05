// tests/auto-route.test.js — auto-route.js (/gps auto). Routing rules: tests/lib/auto-route.test.js.
const assert = require('assert');
const h = require('./helpers');

const root = h.tempProject();
h.ok(root, 'start.js', ['auto-feat']);
const autoEvents = () => h.history(root).filter((e) => e.event === 'auto_started');

// Invalid routes are refused and record nothing.
h.assertFails(h.run(root, 'auto-route.js', ['Finish']), 1, /Unknown target "Finish"/);
h.assertFails(h.run(root, 'auto-route.js', ['ship', 'finish']), 2, /Unexpected argument: finish/);
h.assertFails(h.run(root, 'auto-route.js', ['--delegate', 'ship', 'finish']), 2);
assert.strictEqual(autoEvents().length, 0);

// The whole route from the grill, asking the ship mode once.
let res = h.ok(root, 'auto-route.js');
assert.match(res.out, /target finish\): write:grill → plan → write:plan → ship → finish/);
assert.match(res.out, /Ask once, before the first step: the ship mode \(subagent \+ inline follow-up \(Recommended\)/);
let route = h.json(root, 'auto-route.js');
assert.strictEqual(route.target, 'finish');
assert.deepStrictEqual(route.steps, ['write:grill', 'plan', 'write:plan', 'ship', 'finish']);
assert.deepStrictEqual(route.questions, ['ship-mode']);
assert.deepStrictEqual(autoEvents()[0].detail, { target: 'finish', steps: 'write:grill → plan → write:plan → ship → finish' });

// --delegate presets the ship mode, wherever it sits among the arguments.
route = h.json(root, 'auto-route.js', ['ship', '--delegate']);
assert.deepStrictEqual(route.questions, []);
assert.strictEqual(route.shipMode, 'subagent+inline');
assert.strictEqual(autoEvents().pop().detail.shipMode, 'subagent+inline');
assert.match(h.ok(root, 'auto-route.js', ['--delegate', 'ship']).out, /Ship mode: subagent\+inline \(preset by --delegate\); ask nothing\./);

// No ship step: --delegate is ignored with a warning, and nothing is asked.
res = h.ok(root, 'auto-route.js', ['--delegate', 'plan']);
assert.match(res.err, /⚠️ {2}--delegate ignored/);
assert.match(res.out, /Ask nothing\./);
assert.strictEqual(h.json(root, 'auto-route.js', ['--delegate', 'plan']).shipMode, undefined);

// Later phases start later; a finished session is refused.
h.writeGrill(root);
assert.deepStrictEqual(h.json(root, 'auto-route.js').steps, ['plan', 'write:plan', 'ship', 'finish']);
h.ok(root, 'finish.js');
h.ok(root, 'start.js', ['next']);
h.writeGrill(root);
h.writePlan(root, ['a']);
assert.deepStrictEqual(h.json(root, 'auto-route.js').steps, ['ship', 'finish']);
h.assertFails(h.run(root, 'auto-route.js', ['plan']), 1, /Target "plan" is already done/);

h.done('auto-route.test.js');
