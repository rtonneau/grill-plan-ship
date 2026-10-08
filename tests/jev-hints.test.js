// tests/jev-hints.test.js — jev-hints.js (/gps plan ticket Model/Effort judging)
const assert = require('assert');
const h = require('./helpers');

const TICKETS = '--- ticket: 01-a ---\nDo A.\n\n--- ticket: 02-b ---\nDo B.\n';

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

// Enabled + a real call (stub server) -> used: true, formatted text.
{
  const root = h.tempProject();
  const http = require('http');
  const server = http.createServer((req, res2) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => res2.end(JSON.stringify({
      model: 'jev-1',
      answers: {
        'model_01-a': { type: 'choice', choice: 'sonnet-5.5', confidence: 0.8 },
        'effort_01-a': { type: 'choice', choice: 'high', confidence: 0.7 },
        'model_02-b': { type: 'choice', choice: 'haiku-5.5', confidence: 0.9 },
        'effort_02-b': { type: 'choice', choice: 'low', confidence: 0.6 },
      },
    })));
  });
  server.listen(0);
  const env = { TYPESAFE_API_KEY: 'k', GPS_JEV_BASE_URL: `http://127.0.0.1:${server.address().port}` };
  // jev.enabled must be true in gps-config.json for the script to try at all.
  h.json(root, 'config.js', ['--rescan', '--apply'], env);
  const res = h.ok(root, 'jev-hints.js', ['--json'], env, TICKETS);
  const data = JSON.parse(res.out);
  assert.strictEqual(data.used, true);
  assert.deepStrictEqual(data.tickets['01-a'], { model: 'sonnet', modelRaw: 'sonnet-5.5', modelConfidence: 0.8, effort: 'high', effortConfidence: 0.7 });
  const text = h.ok(root, 'jev-hints.js', [], env, TICKETS).out;
  assert.match(text, /01-a: Model sonnet \(sonnet-5\.5, confidence 0\.8\) · Effort high \(confidence 0\.7\)/);
  server.close();
}

// Enabled but the call fails -> one warning, same shape as "not enabled".
{
  const root = h.tempProject();
  const env = { TYPESAFE_API_KEY: 'k', GPS_JEV_BASE_URL: 'http://127.0.0.1:1' }; // nothing listens here
  h.json(root, 'config.js', ['--rescan', '--apply'], env);
  const res = h.ok(root, 'jev-hints.js', ['--json'], env, TICKETS);
  assert.deepStrictEqual(JSON.parse(res.out).used, false);
  assert.deepStrictEqual(JSON.parse(res.out).tickets, {});
  assert.match(res.err, /⚠️  Jev call failed/);
}

h.done('jev-hints.test.js');
