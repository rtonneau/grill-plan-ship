const assert = require('assert');
const fs = require('fs');
const path = require('path');
const h = require('./helpers');

const args = ['--host', 'codex', '--mode', 'subagent+inline'];
function snapshot(root) {
  function tree(dir) {
    if (!fs.existsSync(dir)) return null;
    return Object.fromEntries(fs.readdirSync(dir).sort().map((name) => {
      const file = path.join(dir, name);
      return [name, fs.statSync(file).isDirectory() ? tree(file) : fs.readFileSync(file).toString('base64')];
    }));
  }
  return { work: tree(path.join(root, '.work')), scratch: tree(path.join(root, '.scratch')),
    head: h.git(root, 'rev-parse', 'HEAD'), index: h.git(root, 'ls-files', '--stage'),
    status: h.git(root, 'status', '--porcelain=v1', '--untracked-files=all') };
}
function check(root, extra = [], code = 0, pattern) {
  const before = snapshot(root);
  const result = h.run(root, 'dispatch-preflight.js', [...args, ...extra, '--json']);
  assert.deepStrictEqual(snapshot(root), before, 'preflight must leave files, directories, HEAD and index unchanged');
  if (code) {
    h.assertFails(result, code, pattern);
    assert.strictEqual(result.out, '', 'failure stdout stays empty');
    return result;
  }
  assert.strictEqual(result.code, 0, result.err);
  return JSON.parse(result.out);
}
const root = h.gitProject();
check(root, [], 1, /session/i);
h.ok(root, 'start.js', ['preflight']);
h.writeGrill(root);
h.ok(root, 'plan.js');
check(root, [], 1, /not written yet/);
const prep = h.json(root, 'write-prepare.js');
fs.writeFileSync(prep.payloadPath, h.planPayload(prep, [
  { slug: 'first' }, { slug: 'later', model: 'medium', effort: 'high' },
  { slug: 'last', model: 'heavy', effort: 'medium' },
]));
h.ok(root, 'write-apply.js');
let data = check(root);
assert.strictEqual(data.tickets[1].resolved.model, 'gpt-6-sol');
assert.strictEqual(data.tickets[2].resolved.model, 'gpt-6-astra');
assert.ok(!fs.existsSync(path.join(h.sessionDir(root), '03-implement', '01-first')));
const file = path.join(root, '.work', 'gps-config.json');
const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
const delegation = { codex: { models: {
  medium: { model: 'test-model', efforts: ['high'] }, heavy: { model: 'test-other', efforts: ['medium'] },
}, inheritEfforts: ['low'] } };
fs.writeFileSync(file, JSON.stringify({ ...stored, delegation }));
data = check(root);
assert.deepStrictEqual(data.tickets[0].resolved, {});
assert.deepStrictEqual(data.tickets[1].resolved, { model: 'test-model', reasoning_effort: 'high' });
assert.strictEqual(data.allDone, false);
assert.strictEqual(data.sessionId, h.currentSession(root));
assert.match(h.ok(root, 'dispatch-preflight.js', args).out, /Runtime capability verification is still required/);
check(root, ['--override', '2=medium/inherit'], 1, /Parent effort is unknown/);
check(root, ['--override', '02=medium/inherit', '--parent-effort', 'medium'], 1, /not configured as supported/);
data = check(root, ['--override', '02=medium/inherit', '--parent-effort', 'high']);
assert.strictEqual(data.tickets[1].effort, 'inherit');
assert.strictEqual(data.tickets[1].resolved.reasoning_effort, 'high');
assert.deepStrictEqual(check(root, ['--override', '2=medium/high']).tickets, check(root, ['--override', '02=medium/high']).tickets);
for (const value of ['2=medium', '2=/high', '2=gpt/high', '2=medium/max', 'x=medium/high']) {
  check(root, ['--override', value], 2, /Invalid --override/);
}
check(root, ['--override', '02=medium/high', '--override', '2=heavy/medium'], 2, /Duplicate/);
check(root, ['--override', '99=inherit/inherit'], 1, /no pending ticket/);
for (const value of ['inherit', 'max', 'ultra']) check(root, ['--parent-effort', value], 2, /--parent-effort/);
h.assertFails(h.run(root, 'dispatch-preflight.js', ['--mode', 'subagent']), 2, /--host/);
h.assertFails(h.run(root, 'dispatch-preflight.js', ['--host', 'codex']), 2, /--mode/);
h.assertFails(h.run(root, 'dispatch-preflight.js', ['--host', 'claude', '--mode', 'subagent', '--parent-effort', 'low']), 2, /only applies/);
check(root, ['--mode', 'inline'], 2); // repeated mode also remains a usage error

// Already-started pending tickets stay in the report; real dispatch revalidates.
h.ok(root, 'ticket-start.js', ['2']);
data = check(root, ['--override', '2=medium/inherit', '--parent-effort', 'high']);
const call = h.json(root, 'dispatch-prompt.js', ['2', ...args, '--effort', 'inherit', '--parent-effort', 'high']).call;
assert.deepStrictEqual(data.tickets[1].resolved, { model: call.model, reasoning_effort: call.reasoning_effort });
fs.writeFileSync(file, JSON.stringify(stored));
assert.strictEqual(h.json(root, 'dispatch-prompt.js', ['2', ...args, '--effort', 'high']).call.model, 'gpt-6-sol');
const claude = JSON.parse(h.ok(root, 'dispatch-preflight.js', ['--host', 'claude', '--mode', 'subagent', '--json']).out);
assert.deepStrictEqual(claude.tickets[1].resolved, { subagent_type: 'grill-plan-ship:gps-ticket-high', model: 'sonnet' });

// Numeric overrides affect every pending duplicate, reporting full keys.
const ticketsDir = path.join(h.sessionDir(root), '02-plan', 'tickets');
fs.copyFileSync(path.join(ticketsDir, '01-first.md'), path.join(ticketsDir, '1-duplicate.md'));
data = check(root, ['--override', '1=inherit/inherit', '--override', '2=inherit/inherit', '--override', '3=inherit/inherit']);
assert.strictEqual(data.tickets.filter((t) => Number(t.ticket.split('-')[0]) === 1).length, 2);
assert.ok(data.tickets.some((t) => t.ticket === '1-duplicate'));
fs.unlinkSync(path.join(ticketsDir, '1-duplicate.md'));
// Hand-edited hints retain queue normalization.
const first = path.join(ticketsDir, '01-first.md');
fs.appendFileSync(first, '\n**Model:** unknown\n**Effort:** turbo\n');
data = check(root);
assert.deepStrictEqual(data.tickets[0].resolved, {});
fs.unlinkSync(file);
check(root);
check(root, ['--override', '2=inherit/inherit', '--override', '3=inherit/inherit']);
assert.ok(!fs.existsSync(file), 'missing configuration is never created');
for (const [n, slug] of [[1, 'first'], [2, 'later'], [3, 'last']]) h.completeTicket(root, n, slug);
data = check(root);
assert.deepStrictEqual(data.tickets, []);
assert.strictEqual(data.allDone, true);
check(root, ['--override', '1=inherit/inherit'], 1, /no pending ticket/);
h.done('dispatch-preflight.test.js');
