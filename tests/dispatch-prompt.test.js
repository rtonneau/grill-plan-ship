// tests/dispatch-prompt.test.js — dispatch-prompt.js (/gps ship: the subagent's Agent call)
const assert = require('assert');
const path = require('path');
const h = require('./helpers');

const root = h.gitProject();
h.shipReady(root, 'dispatch', [{ slug: 'toggle', model: 'haiku' }, { slug: 'docs' }]);
const args = (n, mode, ...rest) => [String(n), '--mode', mode, ...rest];

// Usage errors.
h.assertFails(h.run(root, 'dispatch-prompt.js', ['1']), 2, /--mode must be one of: subagent, subagent\+inline/);
h.assertFails(h.run(root, 'dispatch-prompt.js', args(1, 'inline')), 2, /--mode/);
h.assertFails(h.run(root, 'dispatch-prompt.js', args(1, 'subagent', '--model', 'gpt-9')), 2, /--model must be one of: haiku, sonnet, opus, inherit/);

// Needs ticket-start.js first.
h.assertFails(h.run(root, 'dispatch-prompt.js', args(1, 'subagent')), 1, /no workspace yet[\s\S]*ticket-start\.js 1/);
h.ok(root, 'ticket-start.js', ['1']);

// subagent mode: the ticket's model, every path filled in, the full contract.
let data = h.json(root, 'dispatch-prompt.js', args(1, 'subagent'));
assert.strictEqual(data.model, 'haiku');
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
assert.strictEqual(h.json(root, 'dispatch-prompt.js', args(1, 'subagent', '--model', 'opus')).call.model, 'opus');
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
assert.match(text, /^Agent tool call for ticket 01 \(toggle\), mode subagent, model haiku:/);
assert.match(text, /On DONE run ticket-check\.js 1/);
assert.match(h.ok(root, 'dispatch-prompt.js', args(1, 'subagent+inline')).out, /On READY review and complete it in this session/);

// A Done ticket is refused.
h.completeTicket(root, 1, 'toggle');
h.assertFails(h.run(root, 'dispatch-prompt.js', args(1, 'subagent')), 1, /already Done/);

h.done('dispatch-prompt.test.js');
