// tests/lib/jev.test.js — the Jev HTTP client for ticket Model/Effort hints
const assert = require('assert');
const http = require('http');

function stubServer(handler) {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => handler(JSON.parse(body), req, res));
  });
  server.listen(0);
  return server;
}

delete process.env.TYPESAFE_API_KEY;
const { diagnoseJev, classifyTickets, JevError, FAMILY_BY_MODEL } = require('../../skills/gps/scripts/lib/jev');

assert.deepStrictEqual(diagnoseJev(), { enabled: false, reason: 'TYPESAFE_API_KEY is not set' });
process.env.TYPESAFE_API_KEY = 'test-key';
assert.deepStrictEqual(diagnoseJev(), { enabled: true, reason: 'TYPESAFE_API_KEY is set' });

(async () => {
  // Success: 2 tickets, family collapse for every MODEL_CRITERIA key, effort passed through.
  let seenAuth;
  let server = stubServer((reqBody, req, res) => {
    seenAuth = req.headers.authorization;
    const answers = {};
    for (const name of Object.keys(reqBody.state.tickets.reduce((m, t) => ({ ...m, [t.name]: 1 }), {}))) {
      answers[`model_${name}`] = { type: 'choice', choice: name === '01-a' ? 'sonnet-5.5' : 'haiku-5.5', probabilities: {}, confidence: 0.8 };
      answers[`effort_${name}`] = { type: 'choice', choice: name === '01-a' ? 'high' : 'low', probabilities: {}, confidence: 0.7 };
    }
    res.end(JSON.stringify({ model: 'jev-1', answers, usage: { input_tokens: 1, output_tokens: 1 } }));
  });
  process.env.GPS_JEV_BASE_URL = `http://127.0.0.1:${server.address().port}`;
  const result = await classifyTickets([{ name: '01-a', body: 'Body A' }, { name: '02-b', body: 'Body B' }]);
  assert.strictEqual(seenAuth, 'Bearer test-key');
  assert.deepStrictEqual(result, {
    '01-a': { model: 'sonnet', modelRaw: 'sonnet-5.5', modelConfidence: 0.8, effort: 'high', effortConfidence: 0.7 },
    '02-b': { model: 'haiku', modelRaw: 'haiku-5.5', modelConfidence: 0.8, effort: 'low', effortConfidence: 0.7 },
  });
  server.close();

  // Every MODEL_CRITERIA key collapses to the right family.
  for (const [raw, family] of Object.entries(FAMILY_BY_MODEL)) {
    server = stubServer((reqBody, req, res) => res.end(JSON.stringify({
      model: 'jev-1',
      answers: { 'model_01-a': { type: 'choice', choice: raw, confidence: 0.9 }, 'effort_01-a': { type: 'choice', choice: 'medium', confidence: 0.6 } },
    })));
    process.env.GPS_JEV_BASE_URL = `http://127.0.0.1:${server.address().port}`;
    const one = await classifyTickets([{ name: '01-a', body: 'Body' }]);
    assert.strictEqual(one['01-a'].model, family, raw);
    server.close();
  }

  // Non-2xx -> JevError.
  server = stubServer((_b, _req, res) => { res.statusCode = 500; res.end('oops'); });
  process.env.GPS_JEV_BASE_URL = `http://127.0.0.1:${server.address().port}`;
  await assert.rejects(classifyTickets([{ name: '01-a', body: 'x' }]), (err) => err instanceof JevError && /HTTP 500/.test(err.message));
  server.close();

  // Missing TYPESAFE_API_KEY -> JevError, no network call attempted.
  delete process.env.TYPESAFE_API_KEY;
  await assert.rejects(classifyTickets([{ name: '01-a', body: 'x' }]), (err) => err instanceof JevError && /TYPESAFE_API_KEY/.test(err.message));
  process.env.TYPESAFE_API_KEY = 'test-key';

  // Unknown model choice in the response -> JevError (not silently written).
  server = stubServer((_b, _req, res) => res.end(JSON.stringify({
    model: 'jev-1',
    answers: { 'model_01-a': { type: 'choice', choice: 'gpt-5', confidence: 0.5 }, 'effort_01-a': { type: 'choice', choice: 'low', confidence: 0.5 } },
  })));
  process.env.GPS_JEV_BASE_URL = `http://127.0.0.1:${server.address().port}`;
  await assert.rejects(classifyTickets([{ name: '01-a', body: 'x' }]), (err) => err instanceof JevError && /unknown model "gpt-5"/.test(err.message));
  server.close();

  // Timeout -> JevError (GPS_JEV_TIMEOUT_MS shrunk so the test stays fast).
  process.env.GPS_JEV_TIMEOUT_MS = '100';
  server = stubServer(() => { /* never responds */ });
  process.env.GPS_JEV_BASE_URL = `http://127.0.0.1:${server.address().port}`;
  await assert.rejects(classifyTickets([{ name: '01-a', body: 'x' }]), (err) => err instanceof JevError && /timed out/.test(err.message));
  server.close();
  delete process.env.GPS_JEV_TIMEOUT_MS;
  delete process.env.GPS_JEV_BASE_URL;

  console.log('jev.test.js: all assertions passed');
})();
