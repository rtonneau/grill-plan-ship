const assert = require('assert');
const { buildDispatch, pinnedCodexModel } = require('../../skills/gps/scripts/lib/host-dispatch');

const brief = { model: 'medium', effort: 'high', description: 'ticket', prompt: 'complete brief', taskName: 'gps_ticket_01' };

// Claude: family alias and effort on the call, one subagent type for every level.
assert.deepStrictEqual(buildDispatch('claude', brief), {
  call: { subagent_type: 'general-purpose', model: 'sonnet', effort: 'high', description: 'ticket', prompt: 'complete brief' },
  notes: [],
});
assert.strictEqual(buildDispatch('claude', { ...brief, model: 'fast' }).call.model, 'haiku');
assert.strictEqual(buildDispatch('claude', { ...brief, model: 'heavy' }).call.model, 'opus');
const claudeInherit = buildDispatch('claude', { ...brief, model: 'inherit', effort: 'inherit' }).call;
assert.ok(!('model' in claudeInherit) && !('effort' in claudeInherit));

// Codex without a pin: no model ID is invented; the parent resolves the tier against the live tool.
let codex = buildDispatch('codex', brief);
assert.deepStrictEqual(codex.call, { task_name: 'gps_ticket_01', message: 'complete brief', fork_turns: 'none', reasoning_effort: 'high' });
assert.match(codex.notes.join(' '), /everyday workhorse model offered by your spawn tool \(tier medium\)/);
assert.match(codex.notes.join(' '), /nearest lower level and tell the user/);
assert.match(buildDispatch('codex', { ...brief, model: 'heavy' }).notes[0], /most capable/);
assert.match(buildDispatch('codex', { ...brief, model: 'fast' }).notes[0], /most efficient/);

// Codex inherit: nothing to set, nothing to resolve.
assert.deepStrictEqual(buildDispatch('codex', { ...brief, model: 'inherit', effort: 'inherit' }), {
  call: { task_name: 'gps_ticket_01', message: 'complete brief', fork_turns: 'none' }, notes: [],
});
// A mapped-looking tier with inherited effort omits the effort: the host applies the model's default.
assert.ok(!('reasoning_effort' in buildDispatch('codex', { ...brief, effort: 'inherit' }).call));

// A project pin wins, as a string or as the pre-3.0 { model, efforts } shape.
const pin = (entry) => ({ delegation: { codex: { models: { medium: entry } } } });
assert.strictEqual(buildDispatch('codex', brief, pin('my-model')).call.model, 'my-model');
codex = buildDispatch('codex', brief, pin({ model: 'my-model', efforts: ['low', 'high'] }));
assert.strictEqual(codex.call.model, 'my-model');
assert.strictEqual(codex.call.reasoning_effort, 'high');
assert.deepStrictEqual(codex.notes, []);
// An effort the pin rules out is dropped visibly, never silently and never fatally.
codex = buildDispatch('codex', { ...brief, effort: 'xhigh' }, pin({ model: 'my-model', efforts: ['low'] }));
assert.ok(!('reasoning_effort' in codex.call));
assert.match(codex.notes[0], /Effort xhigh is not listed for my-model.*tell the user/);
// An explicit user requirement must not be downgraded like a ticket preference.
assert.throws(() => buildDispatch('codex', { ...brief, effort: 'xhigh', requiredEffort: true },
  pin({ model: 'my-model', efforts: ['low'] })), /required.*xhigh|xhigh.*required/i);
// Pre-3.0 keys that are no longer read change nothing.
const legacy = { delegation: { codex: { inheritEfforts: ['medium'] } } };
assert.deepStrictEqual(buildDispatch('codex', brief, legacy), buildDispatch('codex', brief));
assert.strictEqual(pinnedCodexModel('medium', { delegation: { codex: { models: { medium: { efforts: ['low'] } } } } }), null);

assert.throws(() => buildDispatch('other', brief), /--host/);
console.log('host-dispatch.test.js: all assertions passed');
