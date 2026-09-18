// scripts/lib/token-usage.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { mangleCwd, touchPhase, computeUsage } = require('./token-usage');

// mangleCwd replaces each :, \, / with -
assert.strictEqual(mangleCwd('C:\\DEV\\AICODE\\grill-plan-ship'), 'C--DEV-AICODE-grill-plan-ship');
assert.strictEqual(mangleCwd('/home/user/project'), '-home-user-project');

// touchPhase: first touch sets startedAt and records the session id
const originalSessionId = process.env.CLAUDE_CODE_SESSION_ID;
process.env.CLAUDE_CODE_SESSION_ID = 'session-a';

let config = {};
touchPhase(config, 'grill');
assert.ok(config.usage.grill.startedAt);
assert.deepStrictEqual(config.usage.grill.sessionIds, ['session-a']);

// touchPhase: repeated touch with same session id does not duplicate, and
// does not reset startedAt
const firstStartedAt = config.usage.grill.startedAt;
touchPhase(config, 'grill');
assert.strictEqual(config.usage.grill.startedAt, firstStartedAt);
assert.deepStrictEqual(config.usage.grill.sessionIds, ['session-a']);

// touchPhase: a later /clear (new session id) appends, doesn't replace
process.env.CLAUDE_CODE_SESSION_ID = 'session-b';
touchPhase(config, 'grill');
assert.deepStrictEqual(config.usage.grill.sessionIds, ['session-a', 'session-b']);

// touchPhase: missing env var is a no-op on sessionIds
delete process.env.CLAUDE_CODE_SESSION_ID;
touchPhase(config, 'plan');
assert.deepStrictEqual(config.usage.plan.sessionIds, []);

process.env.CLAUDE_CODE_SESSION_ID = originalSessionId;

// computeUsage: no usage recorded for phase -> unavailable
assert.deepStrictEqual(computeUsage({}, 'grill'), { available: false });

// computeUsage: recorded phase but no matching transcript file -> unavailable
const transcriptsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-token-usage-'));
config = { usage: { grill: { startedAt: '2026-09-18T09:00:00.000Z', sessionIds: ['missing-session'] } } };
assert.deepStrictEqual(computeUsage(config, 'grill', transcriptsDir), { available: false });

// computeUsage: sums usage across matching lines, ignores lines before
// startedAt, ignores non-assistant lines, tolerates malformed JSON lines,
// and sums across multiple session ids (a /clear mid-phase)
function usageLine(timestamp, usage) {
  return JSON.stringify({ type: 'assistant', timestamp, message: { usage } });
}

fs.writeFileSync(
  path.join(transcriptsDir, 'session-a.jsonl'),
  [
    usageLine('2026-09-18T08:00:00.000Z', { input_tokens: 999, output_tokens: 999, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }), // before startedAt -> excluded
    usageLine('2026-09-18T09:05:00.000Z', { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 5, cache_creation_input_tokens: 1 }),
    JSON.stringify({ type: 'user', timestamp: '2026-09-18T09:06:00.000Z' }), // not an assistant turn -> excluded
    'not valid json {{{', // malformed -> skipped, not fatal
    usageLine('2026-09-18T09:07:00.000Z', { input_tokens: 3, output_tokens: 4, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }),
  ].join('\n')
);

fs.writeFileSync(
  path.join(transcriptsDir, 'session-b.jsonl'),
  usageLine('2026-09-18T09:10:00.000Z', { input_tokens: 100, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 })
);

config = {
  usage: {
    grill: { startedAt: '2026-09-18T09:00:00.000Z', sessionIds: ['session-a', 'session-b'] },
  },
};

const result = computeUsage(config, 'grill', transcriptsDir);
assert.deepStrictEqual(result, {
  available: true,
  input: 10 + 3 + 100,
  output: 20 + 4 + 0,
  cacheRead: 5,
  cacheCreation: 1,
  total: 10 + 3 + 100 + 20 + 4 + 5 + 1,
});

fs.rmSync(transcriptsDir, { recursive: true, force: true });
console.log('token-usage.test.js: all assertions passed');
