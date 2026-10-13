const assert = require('assert');
const { buildDispatch } = require('../../skills/gps/scripts/lib/host-dispatch');

const brief = { model: 'sonnet', effort: 'high', description: 'ticket', prompt: 'complete brief', taskName: 'gps_ticket_01' };
const config = { delegation: { codex: {
  models: { sonnet: { model: 'available-codex-model', efforts: ['low', 'high'] } },
  inheritEfforts: ['medium'],
} } };
assert.deepStrictEqual(buildDispatch('claude', brief), {
  subagent_type: 'grill-plan-ship:gps-ticket-high', model: 'sonnet', description: 'ticket', prompt: 'complete brief',
});
assert.deepStrictEqual(buildDispatch('codex', brief, config), {
  task_name: 'gps_ticket_01', message: 'complete brief', fork_turns: 'none', model: 'available-codex-model', reasoning_effort: 'high',
});
const inherited = { ...brief, model: 'inherit', effort: 'inherit' };
assert.deepStrictEqual(buildDispatch('codex', inherited), {
  task_name: 'gps_ticket_01', message: 'complete brief', fork_turns: 'none',
});
assert.strictEqual(buildDispatch('codex', { ...inherited, effort: 'medium' }, config).reasoning_effort, 'medium');
assert.throws(() => buildDispatch('codex', { ...brief, effort: 'inherit' }, config), /Parent effort is unknown/);
assert.strictEqual(buildDispatch('codex', { ...brief, effort: 'inherit', parentEffort: 'high' }, config).reasoning_effort, 'high');
assert.throws(() => buildDispatch('codex', { ...brief, effort: 'inherit', parentEffort: 'medium' }, config), /not configured as supported/);
assert.strictEqual(buildDispatch('codex', { ...brief, parentEffort: 'low' }, config).reasoning_effort, 'high');
for (const parentEffort of ['inherit', 'max', 'ultra', 'bad']) assert.throws(() => buildDispatch('codex', { ...brief, parentEffort }, config), /--parent-effort/);
assert.throws(() => buildDispatch('claude', { ...brief, parentEffort: 'low' }), /only applies/);
assert.throws(() => buildDispatch('codex', brief), /No Codex model mapping/);
assert.throws(() => buildDispatch('codex', { ...brief, effort: 'xhigh' }, config), /not configured as supported/);
assert.throws(() => buildDispatch('codex', { ...inherited, effort: 'high' }), /not configured as supported/);
assert.throws(() => buildDispatch('codex', brief, { delegation: { codex: { models: { sonnet: { model: 'x', efforts: 'high' } } } } }), /not configured as supported/);
assert.throws(() => buildDispatch('other', brief), /--host/);
console.log('host-dispatch.test.js: all assertions passed');
