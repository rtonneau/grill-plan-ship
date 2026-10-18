// tests/dispatch-prompt.test.js — dispatch-prompt.js (/gps ship: the subagent's Agent call)
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const h = require('./helpers');

const root = h.gitProject();
h.shipReady(root, 'dispatch', [{ slug: 'toggle', model: 'fast' }, { slug: 'docs' }]);
const args = (n, mode, ...rest) => [String(n), '--mode', mode, ...rest];

// Usage errors.
h.assertFails(h.run(root, 'dispatch-prompt.js', ['1']), 2, /--mode must be one of: subagent, subagent\+inline/);
h.assertFails(h.run(root, 'dispatch-prompt.js', args(1, 'inline')), 2, /--mode/);
h.assertFails(h.run(root, 'dispatch-prompt.js', args(1, 'subagent', '--model', 'gpt-9')), 2, /--model must be one of: fast, medium, heavy, inherit/);

// Needs ticket-start.js first.
h.assertFails(h.run(root, 'dispatch-prompt.js', args(1, 'subagent')), 1, /no workspace yet[\s\S]*ticket-start\.js 1/);
h.ok(root, 'ticket-start.js', ['1']);

// subagent mode: the ticket's model, every path filled in, the full contract.
let data = h.json(root, 'dispatch-prompt.js', args(1, 'subagent'));
assert.strictEqual(data.model, 'fast');
assert.strictEqual(data.call.subagent_type, 'general-purpose');
assert.strictEqual(data.call.model, 'haiku');
assert.strictEqual(data.call.description, 'gps ticket 01 toggle');
let prompt = data.call.prompt;
assert.ok(prompt.includes(path.join(h.sessionDir(root), '02-plan', 'tickets', '01-toggle.md')), 'spec path');
assert.ok(prompt.includes(path.join(h.sessionDir(root), '03-implement', '01-toggle', 'commit-log.md')), 'log path');
assert.ok(prompt.includes(`.scratch/tests/${h.currentSession(root)}`), 'scratch dir');
assert.ok(prompt.includes(path.join(h.SCRIPTS, 'ticket-complete.js')), 'absolute script path');
assert.match(prompt, /ticket-complete\.js" 1 --message/);
assert.match(prompt, /ticket-block\.js" 1 --reason/);
assert.match(prompt, /never dispatch subagents of your own/);
assert.match(prompt, /`DONE <commit sha> — <one-line test summary>` or `BLOCKED — <one-line reason>`/);
assert.match(prompt, /git log --oneline/);
assert.doesNotMatch(prompt, /\$CLAUDE_PLUGIN_ROOT/, 'nothing left to substitute');

// --model overrides; inherit leaves the model out of the call.
assert.strictEqual(h.json(root, 'dispatch-prompt.js', args(1, 'subagent', '--model', 'heavy')).call.model, 'opus');
data = h.json(root, 'dispatch-prompt.js', args(1, 'subagent', '--model', 'inherit'));
assert.strictEqual(data.model, 'inherit');
assert.ok(!('model' in data.call));

// subagent+inline mode: implement and verify only, report READY.
prompt = h.json(root, 'dispatch-prompt.js', args(1, 'subagent+inline')).call.prompt;
assert.match(prompt, /do not stage or commit anything/);
assert.match(prompt, /`READY — <files you changed, comma-separated> — <one-line verification result>`/);
assert.doesNotMatch(prompt, /ticket-complete\.js" 1/);

// Text mode shows the call and what to do with its answer.
const text = h.ok(root, 'dispatch-prompt.js', args(1, 'subagent')).out;
assert.match(text, /^Agent tool call for ticket 01 \(toggle\), mode subagent, model fast, effort inherit:/);
assert.match(text, /On DONE run ticket-check\.js 1/);
assert.match(h.ok(root, 'dispatch-prompt.js', args(1, 'subagent+inline')).out, /On READY review and complete it in this session/);

// Codex uses the same brief with explicit, validated host overrides.
const configPath = path.join(root, '.work', 'gps-config.json');
const projectConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const configBefore = fs.readFileSync(configPath, 'utf-8');
h.assertFails(h.run(root, 'dispatch-prompt.js', args(1, 'subagent', '--host', 'unknown')), 2, /--host/);
h.assertFails(h.run(root, 'dispatch-prompt.js', args(1, 'subagent', '--host', 'codex')), 1, /Parent effort is unknown/);
assert.strictEqual(fs.readFileSync(configPath, 'utf-8'), configBefore, 'failed dispatch leaves configuration unchanged');
projectConfig.delegation = { codex: { models: { fast: { model: 'available-model', efforts: ['low'] } } } };
fs.writeFileSync(configPath, JSON.stringify(projectConfig));
const codex = h.json(root, 'dispatch-prompt.js', args(1, 'subagent', '--host', 'codex', '--effort', 'low'));
assert.strictEqual(codex.host, 'codex');
assert.strictEqual(codex.call.model, 'available-model');
assert.strictEqual(codex.call.reasoning_effort, 'low');
assert.strictEqual(codex.call.fork_turns, 'none');
assert.strictEqual(codex.call.message, data.call.prompt);
assert.ok(!('subagent_type' in codex.call));
h.assertFails(h.run(root, 'dispatch-prompt.js', args(1, 'subagent', '--host', 'codex', '--effort', 'high')), 1, /not configured as supported/);
const inheritedCodex = h.json(root, 'dispatch-prompt.js', args(1, 'subagent+inline', '--host', 'codex', '--model', 'inherit', '--effort', 'inherit'));
assert.ok(!('model' in inheritedCodex.call));
assert.ok(!('reasoning_effort' in inheritedCodex.call));
assert.match(inheritedCodex.call.message, /do not stage or commit anything/);
assert.match(h.ok(root, 'dispatch-prompt.js', args(1, 'subagent', '--host', 'codex', '--parent-effort', 'low')).out, /Codex spawn_agent tool call/);

for (const value of ['inherit', 'max', 'ultra', 'bad']) h.assertFails(h.run(root, 'dispatch-prompt.js', args(1, 'subagent', '--host', 'codex', '--parent-effort', value)), 2, /--parent-effort/);
h.assertFails(h.run(root, 'dispatch-prompt.js', args(1, 'subagent', '--parent-effort', 'low')), 2, /only applies/);
const historyBefore = h.history(root);
const savedBefore = fs.readFileSync(configPath, 'utf8');
h.assertFails(h.run(root, 'dispatch-prompt.js', args(1, 'subagent', '--host', 'codex')), 1, /Parent effort is unknown/);
assert.deepStrictEqual(h.history(root), historyBefore);
assert.strictEqual(fs.readFileSync(configPath, 'utf8'), savedBefore);
const resolved = h.json(root, 'dispatch-prompt.js', args(1, 'subagent', '--host', 'codex', '--parent-effort', 'low'));
assert.strictEqual(resolved.effort, 'inherit');
assert.strictEqual(resolved.call.reasoning_effort, 'low');
assert.strictEqual(h.json(root, 'dispatch-prompt.js', args(1, 'subagent', '--host', 'codex', '--parent-effort', 'high', '--effort', 'low')).call.reasoning_effort, 'low');

// A Done ticket is refused.
h.completeTicket(root, 1, 'toggle');
h.assertFails(h.run(root, 'dispatch-prompt.js', args(1, 'subagent')), 1, /already Done/);

// Effort: the ticket's hint picks the plugin subagent; inherit keeps general-purpose;
// --effort overrides; max is refused with the reason (decision 0001).
{
  const r = h.gitProject();
  h.shipReady(r, 'effort', [{ slug: 'a', model: 'medium', effort: 'xhigh' }]);
  h.ok(r, 'ticket-start.js', ['1']);
  let d = h.json(r, 'dispatch-prompt.js', ['1', '--mode', 'subagent']);
  assert.strictEqual(d.effort, 'xhigh');
  assert.strictEqual(d.call.subagent_type, 'grill-plan-ship:gps-ticket-xhigh');
  assert.strictEqual(d.call.model, 'sonnet', 'the portable tier resolves on the call');
  assert.match(h.ok(r, 'dispatch-prompt.js', ['1', '--mode', 'subagent']).out, /subagent_type: grill-plan-ship:gps-ticket-xhigh \(sets effort xhigh\)/);
  d = h.json(r, 'dispatch-prompt.js', ['1', '--mode', 'subagent+inline', '--effort', 'low']);
  assert.strictEqual(d.call.subagent_type, 'grill-plan-ship:gps-ticket-low');
  d = h.json(r, 'dispatch-prompt.js', ['1', '--mode', 'subagent', '--effort', 'inherit']);
  assert.strictEqual(d.call.subagent_type, 'general-purpose');
  h.assertFails(h.run(r, 'dispatch-prompt.js', ['1', '--mode', 'subagent', '--effort', 'turbo']), 2, /--effort must be one of: low, medium, high, xhigh, inherit\./);
  h.assertFails(h.run(r, 'dispatch-prompt.js', ['1', '--mode', 'subagent', '--effort', 'max']), 2, /--effort must be one of: .* \(gps effort hints stop at xhigh/);
}

h.done('dispatch-prompt.test.js');
