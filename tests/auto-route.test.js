// tests/auto-route.test.js — auto-route.js (/gps auto). Routing rules: tests/lib/auto-route.test.js.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const h = require('./helpers');

const root = h.tempProject();
h.ok(root, 'start.js', ['auto-feat']);
const autoEvents = () => h.history(root).filter((e) => e.event === 'auto_started');

// Invalid routes are refused and record nothing.
h.assertFails(h.run(root, 'auto-route.js', ['Finish']), 1, /Unknown target "Finish"/);
h.assertFails(h.run(root, 'auto-route.js', ['ship', 'finish']), 2, /Unexpected argument: finish/);
h.assertFails(h.run(root, 'auto-route.js', ['--delegate', 'ship', 'finish']), 2);
assert.strictEqual(autoEvents().length, 0);

// The whole route from the grill, with no question to ask.
let res = h.ok(root, 'auto-route.js');
assert.match(res.out, /target finish\): write:grill → plan → write:plan → ship → finish/);
let route = h.json(root, 'auto-route.js');
assert.strictEqual(route.target, 'finish');
assert.deepStrictEqual(route.steps, ['write:grill', 'plan', 'write:plan', 'ship', 'finish']);
assert.strictEqual(route.questions, undefined);
assert.deepStrictEqual(autoEvents()[0].detail, { target: 'finish', steps: 'write:grill → plan → write:plan → ship → finish' });

// Target ship chains finish by default; ship.autoFinish false in .work/gps-config.json stops at ship.
const configFile = path.join(root, '.work', 'gps-config.json');
const setAutoFinish = (value) => {
  const cfg = fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, 'utf8')) : { version: 1 };
  fs.writeFileSync(configFile, JSON.stringify({ ...cfg, ship: { autoFinish: value } }));
};
res = h.ok(root, 'auto-route.js', ['ship']);
assert.match(res.out, /target ship\): write:grill → plan → write:plan → ship → finish/);
assert.match(res.out, /finish follows ship because ship\.autoFinish is on\./);
route = h.json(root, 'auto-route.js', ['ship']);
assert.strictEqual(route.target, 'ship');
assert.deepStrictEqual(route.steps, ['write:grill', 'plan', 'write:plan', 'ship', 'finish']);
assert.strictEqual(autoEvents().pop().detail.steps, 'write:grill → plan → write:plan → ship → finish');
setAutoFinish(false);
res = h.ok(root, 'auto-route.js', ['ship']);
assert.match(res.out, /target ship\): write:grill → plan → write:plan → ship$/m);
assert.doesNotMatch(res.out, /finish follows ship/);
assert.deepStrictEqual(h.json(root, 'auto-route.js', ['ship']).steps, ['write:grill', 'plan', 'write:plan', 'ship']);
assert.deepStrictEqual(h.json(root, 'auto-route.js').steps, ['write:grill', 'plan', 'write:plan', 'ship', 'finish']);
setAutoFinish(true);
assert.deepStrictEqual(h.json(root, 'auto-route.js', ['ship']).steps, ['write:grill', 'plan', 'write:plan', 'ship', 'finish']);

// --delegate presets the ship mode, wherever it sits among the arguments.
route = h.json(root, 'auto-route.js', ['ship', '--delegate']);
assert.strictEqual(route.shipMode, 'delegate');
assert.strictEqual(autoEvents().pop().detail.shipMode, 'delegate');
assert.match(h.ok(root, 'auto-route.js', ['--delegate', 'ship']).out, /Ship mode: delegate \(preset\)\./);
assert.strictEqual(h.json(root, 'auto-route.js', ['--inline']).shipMode, 'inline');
h.assertFails(h.run(root, 'auto-route.js', ['--inline', '--delegate']), 2, /not both/);

// No ship step: --delegate is ignored with a warning.
res = h.ok(root, 'auto-route.js', ['--delegate', 'plan']);
assert.match(res.err, /⚠️ {2}--delegate ignored/);
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
