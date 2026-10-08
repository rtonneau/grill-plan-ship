// tests/jev-hints.test.js — jev-hints.js (/gps plan ticket Model/Effort judging)
const assert = require('assert');
const path = require('path');
const { spawn } = require('child_process');
const h = require('./helpers');

const TICKETS = '--- ticket: 01-a ---\nDo A.\n\n--- ticket: 02-b ---\nDo B.\n';
const STUB_SERVER = path.join(__dirname, 'fixtures', 'http-stub-server.js');

// Starts tests/fixtures/http-stub-server.js (a separate process, so it keeps
// answering while h.ok's spawnSync blocks this test's own event loop) and
// resolves with its port once it reports it is listening.
function startStub(responseBody) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [STUB_SERVER, responseBody]);
    let buf = '';
    child.stdout.on('data', (chunk) => {
      buf += chunk;
      const match = buf.match(/^PORT (\d+)/m);
      if (match) resolve({ port: Number(match[1]), child });
    });
    child.on('error', reject);
    child.on('exit', (code) => reject(new Error(`stub server exited early (code ${code})`)));
  });
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

(async () => {
  // Enabled + a real call (stub server in its own process, so h.ok's
  // spawnSync blocking this process's event loop can't stop it answering)
  // -> used: true, formatted text.
  {
    const root = h.tempProject();
    const responseBody = JSON.stringify({
      model: 'jev-1',
      answers: {
        'model_01-a': { type: 'choice', choice: 'sonnet-5.5', confidence: 0.8 },
        'effort_01-a': { type: 'choice', choice: 'high', confidence: 0.7 },
        'model_02-b': { type: 'choice', choice: 'haiku-5.5', confidence: 0.9 },
        'effort_02-b': { type: 'choice', choice: 'low', confidence: 0.6 },
      },
    });
    const { port, child } = await startStub(responseBody);
    try {
      const env = { TYPESAFE_API_KEY: 'k', GPS_JEV_BASE_URL: `http://127.0.0.1:${port}` };
      // jev.enabled must be true in gps-config.json for the script to try at all.
      h.json(root, 'config.js', ['--rescan', '--apply'], env);
      const res = h.ok(root, 'jev-hints.js', ['--json'], env, TICKETS);
      const data = JSON.parse(res.out);
      assert.strictEqual(data.used, true);
      assert.deepStrictEqual(data.tickets['01-a'], { model: 'sonnet', modelRaw: 'sonnet-5.5', modelConfidence: 0.8, effort: 'high', effortConfidence: 0.7 });
      const text = h.ok(root, 'jev-hints.js', [], env, TICKETS).out;
      assert.match(text, /01-a: Model sonnet \(sonnet-5\.5, confidence 0\.8\) · Effort high \(confidence 0\.7\)/);
    } finally {
      child.kill();
    }
  }

  // Enabled but the call fails (unreachable port, no server needed) -> one
  // warning, same shape as "not enabled".
  {
    const root = h.tempProject();
    const env = { TYPESAFE_API_KEY: 'k', GPS_JEV_BASE_URL: 'http://127.0.0.1:1' }; // nothing listens here
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
})();
