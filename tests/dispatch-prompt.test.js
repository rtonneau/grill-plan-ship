// tests/dispatch-prompt.test.js — dispatch-prompt.js (/gps ship: the child's spawn call)
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const h = require('./helpers');

const root = h.gitProject();
h.shipReady(root, 'dispatch', [{ slug: 'toggle', model: 'fast' }, { slug: 'docs' }]);

// Usage errors.
h.assertFails(h.run(root, 'dispatch-prompt.js', []), 2);
h.assertFails(h.run(root, 'dispatch-prompt.js', ['1', '--model', 'gpt-9']), 2, /--model must be one of: fast, medium, heavy, inherit/);
h.assertFails(h.run(root, 'dispatch-prompt.js', ['1', '--host', 'unknown']), 2, /--host/);
h.assertFails(h.run(root, 'dispatch-prompt.js', ['1', '--mode', 'subagent']), 2, /Unknown option/i);

// Needs ticket-start.js first.
h.assertFails(h.run(root, 'dispatch-prompt.js', ['1']), 1, /no workspace yet[\s\S]*ticket-start\.js 1/);
h.ok(root, 'ticket-start.js', ['1']);

// The brief: every path filled in, the parent owns git, one final line.
let data = h.json(root, 'dispatch-prompt.js', ['1']);
assert.strictEqual(data.model, 'fast');
assert.strictEqual(data.call.subagent_type, 'general-purpose');
assert.strictEqual(data.call.model, 'haiku');
assert.strictEqual(data.call.description, 'gps ticket 01 toggle');
const prompt = data.call.prompt;
assert.ok(prompt.includes(path.join(h.sessionDir(root), '02-plan', 'tickets', '01-toggle.md')), 'spec path');
assert.ok(prompt.includes(path.join(h.sessionDir(root), '03-implement', '01-toggle', 'commit-log.md')), 'log path');
assert.ok(prompt.includes(`.scratch/tests/${h.currentSession(root)}`), 'scratch dir');
assert.match(prompt, /only writer in this tree/);
assert.match(prompt, /leave your changes unstaged and uncommitted/);
assert.match(prompt, /permission or sandbox denial, stop and report BLOCKED/);
assert.match(prompt, /never retry it through another shell, tool or agent/);
assert.match(prompt, /`READY — <files you changed, comma-separated> — <verification result>` or `BLOCKED — <cause, and what you tried>`/);
assert.doesNotMatch(prompt, /ticket-complete\.js"/, 'the child runs no ticket script');

// --model overrides; inherit leaves the model out of the call.
assert.strictEqual(h.json(root, 'dispatch-prompt.js', ['1', '--model', 'heavy']).call.model, 'opus');
data = h.json(root, 'dispatch-prompt.js', ['1', '--model', 'inherit']);
assert.strictEqual(data.model, 'inherit');
assert.ok(!('model' in data.call));

// Text mode shows the call.
assert.match(h.ok(root, 'dispatch-prompt.js', ['1']).out, /^Agent tool call for ticket 01 \(toggle\), model fast, effort inherit:/);

// Codex: the same brief; the tier stays a note for the parent unless the project pinned a model.
const configPath = path.join(root, '.work', 'gps-config.json');
const before = fs.readFileSync(configPath, 'utf-8');
let codex = h.json(root, 'dispatch-prompt.js', ['1', '--host', 'codex']);
assert.strictEqual(codex.host, 'codex');
assert.strictEqual(codex.call.message, prompt);
assert.strictEqual(codex.call.fork_turns, 'none');
assert.strictEqual(codex.call.task_name, 'gps_ticket_01');
assert.ok(!('model' in codex.call), 'no invented model ID');
assert.ok(!('subagent_type' in codex.call));
assert.match(codex.notes[0], /most efficient model offered by your spawn tool/);
assert.match(h.ok(root, 'dispatch-prompt.js', ['1', '--host', 'codex']).out, /Codex spawn_agent tool call[\s\S]*- Note: Set model/);
assert.strictEqual(fs.readFileSync(configPath, 'utf-8'), before, 'dispatch changes nothing');
fs.writeFileSync(configPath, JSON.stringify({ ...JSON.parse(before), delegation: { codex: { models: { fast: { model: 'available-model', efforts: ['low'] } } } } }));
codex = h.json(root, 'dispatch-prompt.js', ['1', '--host', 'codex', '--effort', 'low']);
assert.strictEqual(codex.call.model, 'available-model');
assert.strictEqual(codex.call.reasoning_effort, 'low');
h.assertFails(h.run(root, 'dispatch-prompt.js', ['1', '--host', 'codex', '--effort', 'high']), 1, /required.*high|high.*required/i);
const inherited = h.json(root, 'dispatch-prompt.js', ['1', '--host', 'codex', '--model', 'inherit', '--effort', 'inherit']);
assert.ok(!('model' in inherited.call) && !('reasoning_effort' in inherited.call));
assert.deepStrictEqual(inherited.notes, []);

// A Done ticket is refused.
h.completeTicket(root, 1, 'toggle');
h.assertFails(h.run(root, 'dispatch-prompt.js', ['1']), 1, /already Done/);

// Effort: passed on the call; max is refused with the reason (decision 0001).
{
  const r = h.gitProject();
  h.shipReady(r, 'effort', [{ slug: 'a', model: 'medium', effort: 'xhigh' }]);
  h.ok(r, 'ticket-start.js', ['1']);
  let d = h.json(r, 'dispatch-prompt.js', ['1']);
  assert.strictEqual(d.effort, 'xhigh');
  assert.strictEqual(d.call.effort, 'xhigh');
  assert.strictEqual(d.call.model, 'sonnet');
  assert.strictEqual(h.json(r, 'dispatch-prompt.js', ['1', '--effort', 'low']).call.effort, 'low');
  d = h.json(r, 'dispatch-prompt.js', ['1', '--effort', 'inherit']);
  assert.ok(!('effort' in d.call));
  h.assertFails(h.run(r, 'dispatch-prompt.js', ['1', '--effort', 'turbo']), 2, /--effort must be one of: low, medium, high, xhigh, inherit\./);
  h.assertFails(h.run(r, 'dispatch-prompt.js', ['1', '--effort', 'max']), 2, /--effort must be one of: .* \(gps effort hints stop at xhigh/);
}

h.done('dispatch-prompt.test.js');
