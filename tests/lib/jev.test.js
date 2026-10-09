// tests/lib/jev.test.js — the Jev HTTP client for ticket Model/Effort hints
// (fetch is faked by tests/fixtures/fake-fetch.js, so no socket is opened)
const assert = require('assert');
const fakeFetch = require('../fixtures/fake-fetch');

delete process.env.TYPESAFE_API_KEY;
const { diagnoseJev, classifyTickets, JevError, FAMILY_BY_MODEL } = require('../../skills/gps/scripts/lib/jev');

assert.deepStrictEqual(diagnoseJev(), { enabled: false, reason: 'TYPESAFE_API_KEY is not set' });
process.env.TYPESAFE_API_KEY = 'test-key';
assert.deepStrictEqual(diagnoseJev(), { enabled: true, reason: 'TYPESAFE_API_KEY is set' });

function choices(name, model, effort) {
  return {
    [`model_${name}`]: { type: 'choice', choice: model, probabilities: {}, confidence: 0.8 },
    [`effort_${name}`]: { type: 'choice', choice: effort, probabilities: {}, confidence: 0.7 },
  };
}

(async () => {
  // Success: 2 tickets, family collapse, effort passed through, real endpoint and Bearer header.
  fakeFetch.next = {
    body: {
      model: 'jev-1',
      answers: { ...choices('01-a', 'sonnet-5.5', 'high'), ...choices('02-b', 'haiku-5.5', 'low') },
      usage: { input_tokens: 1, output_tokens: 1 },
    },
  };
  const result = await classifyTickets([{ name: '01-a', body: 'Body A' }, { name: '02-b', body: 'Body B' }]);
  assert.strictEqual(fakeFetch.calls.length, 1);
  assert.strictEqual(fakeFetch.calls[0].url, 'https://api.typesafe.ai/v1/systemone');
  assert.strictEqual(fakeFetch.calls[0].init.headers.Authorization, 'Bearer test-key');
  assert.deepStrictEqual(result, {
    '01-a': { model: 'sonnet', modelRaw: 'sonnet-5.5', modelConfidence: 0.8, effort: 'high', effortConfidence: 0.7 },
    '02-b': { model: 'haiku', modelRaw: 'haiku-5.5', modelConfidence: 0.8, effort: 'low', effortConfidence: 0.7 },
  });

  // Every MODEL_CRITERIA key collapses to the right family.
  for (const [raw, family] of Object.entries(FAMILY_BY_MODEL)) {
    fakeFetch.next = { body: { model: 'jev-1', answers: choices('01-a', raw, 'medium') } };
    const one = await classifyTickets([{ name: '01-a', body: 'Body' }]);
    assert.strictEqual(one['01-a'].model, family, raw);
  }

  // Non-2xx -> JevError.
  fakeFetch.next = { status: 500, body: 'oops' };
  await assert.rejects(classifyTickets([{ name: '01-a', body: 'x' }]), (err) => err instanceof JevError && /HTTP 500/.test(err.message));

  // Connection refused -> JevError.
  fakeFetch.next = { refuse: true };
  await assert.rejects(classifyTickets([{ name: '01-a', body: 'x' }]), (err) => err instanceof JevError && /fetch failed/.test(err.message));

  // Missing TYPESAFE_API_KEY -> JevError, no network call attempted.
  delete process.env.TYPESAFE_API_KEY;
  const callsBefore = fakeFetch.calls.length;
  await assert.rejects(classifyTickets([{ name: '01-a', body: 'x' }]), (err) => err instanceof JevError && /TYPESAFE_API_KEY/.test(err.message));
  assert.strictEqual(fakeFetch.calls.length, callsBefore);
  process.env.TYPESAFE_API_KEY = 'test-key';

  // Unknown model choice in the response -> JevError (not silently written).
  fakeFetch.next = { body: { model: 'jev-1', answers: choices('01-a', 'gpt-5', 'low') } };
  await assert.rejects(classifyTickets([{ name: '01-a', body: 'x' }]), (err) => err instanceof JevError && /unknown model "gpt-5"/.test(err.message));

  // A prototype-chain name (e.g. "constructor") is not a known model or
  // effort just because property lookup finds it on Object.prototype.
  fakeFetch.next = { body: { model: 'jev-1', answers: choices('01-a', 'constructor', 'low') } };
  await assert.rejects(classifyTickets([{ name: '01-a', body: 'x' }]), (err) => err instanceof JevError && /unknown model "constructor"/.test(err.message));
  fakeFetch.next = { body: { model: 'jev-1', answers: choices('01-a', 'haiku-5.5', 'toString') } };
  await assert.rejects(classifyTickets([{ name: '01-a', body: 'x' }]), (err) => err instanceof JevError && /unknown effort "toString"/.test(err.message));

  // Timeout -> JevError (GPS_JEV_TIMEOUT_MS shrunk so the test stays fast).
  process.env.GPS_JEV_TIMEOUT_MS = '100';
  fakeFetch.next = { hang: true };
  await assert.rejects(classifyTickets([{ name: '01-a', body: 'x' }]), (err) => err instanceof JevError && /timed out/.test(err.message));
  delete process.env.GPS_JEV_TIMEOUT_MS;

  console.log('jev.test.js: all assertions passed');
})();
