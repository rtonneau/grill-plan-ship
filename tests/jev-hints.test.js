// tests/jev-hints.test.js — jev-hints.js (/gps plan ticket Model/Effort judging)
const assert = require('assert');
const path = require('path');
const h = require('./helpers');

const TICKETS = '--- ticket: 01-a ---\nDo A.\n\n--- ticket: 02-b ---\nDo B.\n';

// Runs the child script with tests/fixtures/fake-fetch.js preloaded, so its fetch is
// scripted by `behavior` and no socket is opened. Forward slashes: NODE_OPTIONS
// treats backslashes as escapes.
const FAKE_FETCH = path.join(__dirname, 'fixtures', 'fake-fetch.js').replace(/\\/g, '/');
function fakeEnv(behavior) {
  return { TYPESAFE_API_KEY: 'k', NODE_OPTIONS: `--require "${FAKE_FETCH}"`, GPS_FAKE_FETCH: JSON.stringify(behavior) };
}

// Not enabled: no warning, same shape as a failed call.
{
  const root = h.tempProject();
  const res = h.ok(root, 'jev-hints.js', ['--json'], { TYPESAFE_API_KEY: '' }, TICKETS);
  assert.deepStrictEqual(JSON.parse(res.out), { used: false, reason: 'jev.enabled is false', tickets: {} });
  assert.strictEqual(res.err, '');
}

// Bad stdin: invalid ticket name -> usage error, nothing attempted.
{
  const root = h.tempProject();
  const res = h.run(root, 'jev-hints.js', [], {}, '--- ticket: not valid ---\nx\n');
  h.assertFails(res, 2, /Invalid ticket name/);
}

// Enabled, key set but jev.enabled false -> stays "not enabled", no warning
// (jev-hints.js checks jevEnabled(projectRoot), not just the env var).
{
  const root = h.tempProject();
  h.json(root, 'config.js', [], { TYPESAFE_API_KEY: '' }); // seeds jev.enabled: false
  const res = h.ok(root, 'jev-hints.js', ['--json'], { TYPESAFE_API_KEY: 'k' }, TICKETS);
  assert.deepStrictEqual(JSON.parse(res.out), { used: false, reason: 'jev.enabled is false', tickets: {} });
  assert.strictEqual(res.err, '');
}

// Enabled + a call (fake fetch preloaded in the child) -> used: true, formatted text.
{
  const root = h.tempProject();
  const env = fakeEnv({
    body: {
      model: 'jev-1',
      answers: {
        'model_01-a': { type: 'choice', choice: 'sonnet-5.5', confidence: 0.8 },
        'effort_01-a': { type: 'choice', choice: 'high', confidence: 0.7 },
        'model_02-b': { type: 'choice', choice: 'haiku-5.5', confidence: 0.9 },
        'effort_02-b': { type: 'choice', choice: 'low', confidence: 0.6 },
      },
    },
  });
  // jev.enabled must be true in gps-config.json for the script to try at all.
  h.json(root, 'config.js', ['--rescan', '--apply'], env);
  const res = h.ok(root, 'jev-hints.js', ['--json'], env, TICKETS);
  const data = JSON.parse(res.out);
  assert.strictEqual(data.used, true);
  assert.deepStrictEqual(data.tickets['01-a'], { model: 'sonnet', modelRaw: 'sonnet-5.5', modelConfidence: 0.8, effort: 'high', effortConfidence: 0.7 });
  const text = h.ok(root, 'jev-hints.js', [], env, TICKETS).out;
  assert.match(text, /01-a: Model sonnet \(sonnet-5\.5, confidence 0\.8\) · Effort high \(confidence 0\.7\)/);
}

// Enabled but the call fails (connection refused) -> one
// warning, same shape as "not enabled".
{
  const root = h.tempProject();
  const env = fakeEnv({ refuse: true });
  h.json(root, 'config.js', ['--rescan', '--apply'], env);
  const res = h.ok(root, 'jev-hints.js', ['--json'], env, TICKETS);
  assert.deepStrictEqual(JSON.parse(res.out).used, false);
  assert.deepStrictEqual(JSON.parse(res.out).tickets, {});
  assert.match(res.err, /⚠️  Jev call failed/);
}

// jev.enabled true but TYPESAFE_API_KEY unset at call time -> treated the
// same as "not enabled" (no warning), not a surprise failure warning.
{
  const root = h.tempProject();
  h.json(root, 'config.js', ['--rescan', '--apply'], { TYPESAFE_API_KEY: 'k' }); // seeds jev.enabled: true
  const res = h.ok(root, 'jev-hints.js', ['--json'], { TYPESAFE_API_KEY: '' }, TICKETS);
  assert.deepStrictEqual(JSON.parse(res.out), { used: false, reason: 'TYPESAFE_API_KEY is not set.', tickets: {} });
  assert.strictEqual(res.err, '');
}

h.done('jev-hints.test.js');
