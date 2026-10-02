// tests/plan.test.js — plan.js (/gps plan)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const h = require('./helpers');

{
  const root = h.tempProject();
  h.assertFails(h.run(root, 'plan.js'), 1, /No sessions found/);
  h.ok(root, 'start.js', ['planned']);

  // Before the grill is saved -> refused.
  h.assertFails(h.run(root, 'plan.js'), 1, /placeholders/);

  h.writeGrill(root);
  const res = h.ok(root, 'plan.js');
  assert.match(res.out, /✅ Plan started/);
  assert.match(res.out, /Next: draft the tickets/);
  const planDir = path.join(h.sessionDir(root), '02-plan');
  // Only plan.md: no placeholder ticket files.
  assert.deepStrictEqual(fs.readdirSync(planDir), ['plan.md']);
  assert.strictEqual(h.history(root).pop().event, 'plan_started');
  assert.strictEqual(h.readConfig(root).current_phase, 'plan');

  // Re-running while the plan is pending -> refused, points at /gps write.
  h.assertFails(h.run(root, 'plan.js'), 1, /\/gps write/);

  // Once written -> refused, nothing changes.
  const prep = h.json(root, 'write-prepare.js');
  fs.writeFileSync(prep.payloadPath, h.planPayload(prep, [{ slug: 'a' }]));
  h.ok(root, 'write-apply.js');
  h.assertFails(h.run(root, 'plan.js'), 1, /already exists/);
  assert.match(fs.readFileSync(path.join(planDir, 'plan.md'), 'utf-8'), /Strategy content\./);
  assert.deepStrictEqual(fs.readdirSync(path.join(planDir, 'tickets')), ['01-a.md']);
}

{
  // A session created before history existed is backfilled on its next event.
  const root = h.tempProject();
  h.ok(root, 'start.js', ['legacy']);
  h.writeGrill(root);
  const legacy = h.readConfig(root);
  delete legacy.history;
  delete legacy.current_phase;
  fs.writeFileSync(h.configPath(root), JSON.stringify(legacy));
  h.ok(root, 'plan.js');
  assert.deepStrictEqual(h.history(root).map((e) => [e.event, Boolean(e.backfilled)]),
    [['session_started', true], ['plan_started', false]]);
}

{
  // --json
  const root = h.tempProject();
  h.ok(root, 'start.js', ['j']);
  h.writeGrill(root);
  const data = h.json(root, 'plan.js');
  assert.ok(data.planPath.endsWith(path.join('02-plan', 'plan.md')));
  assert.ok(data.resumePath.endsWith('resume.md'));
  h.assertFails(h.run(root, 'plan.js', ['extra']), 2, /Unexpected argument: extra/);
}

h.done('plan.test.js');
