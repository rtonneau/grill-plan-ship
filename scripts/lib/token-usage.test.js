// scripts/lib/token-usage.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { mangleCwd, touchPhase, computeUsage } = require('./token-usage');

// mangleCwd replaces every non-alphanumeric character with - (matches the
// folder names Claude Code actually creates under ~/.claude/projects)
assert.strictEqual(mangleCwd('C:\\DEV\\AICODE\\grill-plan-ship'), 'C--DEV-AICODE-grill-plan-ship');
assert.strictEqual(mangleCwd('/home/user/project'), '-home-user-project');
assert.strictEqual(
  mangleCwd('C:\\DEV\\AICODE\\grill-plan-ship\\.claude\\worktrees\\handoff-resume'),
  'C--DEV-AICODE-grill-plan-ship--claude-worktrees-handoff-resume'
);
assert.strictEqual(mangleCwd('C:\\DEV\\geant4-v11.4.1-source'), 'C--DEV-geant4-v11-4-1-source');
assert.strictEqual(mangleCwd('D:\\Université de Namur\\x_y'), 'D--Universit--de-Namur-x-y');

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

// computeUsage: lines repeating the same message.id are counted once, and
// sub-agent transcripts under <sessionId>/subagents/ are included
function idLine(id, timestamp, usage) {
  return JSON.stringify({ type: 'assistant', timestamp, message: { id, usage } });
}
const u = (input, output) => ({ input_tokens: input, output_tokens: output, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 });
fs.writeFileSync(
  path.join(transcriptsDir, 'session-c.jsonl'),
  [
    idLine('msg_1', '2026-09-18T09:01:00.000Z', u(10, 5)),
    idLine('msg_1', '2026-09-18T09:01:01.000Z', u(10, 5)), // same response, second content block
    idLine('msg_1', '2026-09-18T09:01:02.000Z', u(10, 5)),
    idLine('msg_2', '2026-09-18T09:02:00.000Z', u(1, 1)),
  ].join('\n')
);
fs.mkdirSync(path.join(transcriptsDir, 'session-c', 'subagents'), { recursive: true });
fs.writeFileSync(
  path.join(transcriptsDir, 'session-c', 'subagents', 'agent-x.jsonl'),
  [
    idLine('msg_sub', '2026-09-18T09:03:00.000Z', u(100, 50)),
    idLine('msg_sub', '2026-09-18T09:03:01.000Z', u(100, 50)),
  ].join('\n')
);
fs.writeFileSync(path.join(transcriptsDir, 'session-c', 'subagents', 'agent-x.meta.json'), '{}');
const deduped = computeUsage(
  { usage: { plan: { startedAt: '2026-09-18T09:00:00.000Z', sessionIds: ['session-c'] } } },
  'plan',
  transcriptsDir
);
assert.deepStrictEqual(deduped, {
  available: true, input: 111, output: 56, cacheRead: 0, cacheCreation: 0, total: 167,
});

// a session with only sub-agent transcripts still reports usage
fs.mkdirSync(path.join(transcriptsDir, 'session-d', 'subagents'), { recursive: true });
fs.writeFileSync(path.join(transcriptsDir, 'session-d', 'subagents', 'agent-y.jsonl'), idLine('m', '2026-09-18T09:03:00.000Z', u(2, 2)));
assert.strictEqual(
  computeUsage({ usage: { plan: { startedAt: '2026-09-18T09:00:00.000Z', sessionIds: ['session-d'] } } }, 'plan', transcriptsDir).total,
  4
);

fs.rmSync(transcriptsDir, { recursive: true, force: true });
console.log('token-usage.test.js: all assertions passed');
