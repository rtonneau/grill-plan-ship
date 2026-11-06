// Real scripts and local Git; only GitHub's network boundary is stubbed.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const h = require('./helpers');

function fixture(name, issue = false) {
  const root = h.gitProject(`gps-finish-${name}-`);
  const remote = h.tempProject('gps-finish-remote-');
  h.git(remote, 'init', '--bare', '-q');
  h.git(root, 'remote', 'add', 'origin', 'https://github.com/fixture/finish.git');
  h.git(root, 'config', `url.${remote.replace(/\\/g, '/')}.insteadOf`, 'https://github.com/fixture/finish.git');
  const stub = path.join(remote, 'gh.js');
  const calls = path.join(remote, 'calls.json');
  fs.writeFileSync(stub, `
const fs = require('fs');
const args = process.argv.slice(2);
const file = ${JSON.stringify(calls)};
const calls = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : [];
calls.push(args); fs.writeFileSync(file, JSON.stringify(calls));
if (args[0] === 'auth') process.exit(0);
if (args[1] === 'list') {
  if (process.env.FAIL_LOOKUP) { console.error('lookup denied'); process.exit(1); }
  if (calls.some(a => a[1] === 'create')) console.log('https://github.com/fixture/finish/pull/1');
  process.exit(0);
}
if (args[1] === 'view') {
  if (args[0] === 'issue') {
    const comments = calls.filter(a => a[0] === 'issue' && a[1] === 'comment').map(a => ({ body: 'gps session: ' + String.fromCharCode(96) + process.env.FIXTURE_SESSION + String.fromCharCode(96) }));
    console.log(JSON.stringify({ comments }));
  } else console.log('{}');
  process.exit(0);
}
if (args[1] === 'create') {
  if (process.env.FAIL_CREATE) { console.error('create denied'); process.exit(1); }
  console.log('https://github.com/fixture/finish/' + (args[0] === 'issue' ? 'issues' : 'pull') + '/1');
}
`);
  const env = { GPS_GH_BIN: stub };
  h.ok(root, 'start.js', [...(issue ? ['--issue'] : []), name], env);
  h.writeGrill(root, {}, env);
  if (!issue) {
    h.writePlan(root, ['a'], { branch: `feat/${name}` }, env);
    h.completeTicket(root, 1, 'a', env);
  }
  const id = h.currentSession(root);
  env.FIXTURE_SESSION = id;
  const configPath = h.configPath(root);
  return { root, remote, env, id, configPath, calls: () => JSON.parse(fs.readFileSync(calls)) };
}

{
  const f = fixture('push-failure');
  h.git(f.root, 'remote', 'set-url', '--push', 'origin', path.join(f.remote, 'missing'));
  const result = h.run(f.root, 'finish.js', [], f.env);
  h.assertFails(result, 1, /push.*failed|delivery.*failed/i);
  assert.strictEqual(h.currentSession(f.root), f.id);
  assert.strictEqual(h.git(f.root, 'branch', '--show-current'), 'feat/push-failure');
  assert.strictEqual(JSON.parse(fs.readFileSync(f.configPath)).finished_at, undefined);
  h.git(f.root, 'remote', 'set-url', '--push', 'origin', f.remote);
  h.ok(f.root, 'finish.js', [], f.env);
  assert.strictEqual(f.calls().filter(a => a[1] === 'create').length, 1);
}

{
  const f = fixture('lookup-failure');
  h.assertFails(h.run(f.root, 'finish.js', [], { ...f.env, FAIL_LOOKUP: '1' }), 1, /lookup denied/);
  assert.strictEqual(f.calls().filter(a => a[1] === 'create').length, 0, 'lookup errors cannot authorize creating a PR');
  assert.strictEqual(h.currentSession(f.root), f.id);
  h.ok(f.root, 'finish.js', [], f.env);
}

{
  const f = fixture('record-failure');
  const hook = path.join(f.root, '.git', 'hooks', 'pre-commit');
  fs.writeFileSync(hook, '#!/bin/sh\necho record-denied >&2\nexit 1\n', { mode: 0o755 });
  h.assertFails(h.run(f.root, 'finish.js', [], f.env), 1, /record.*failed|record-denied/i);
  assert.strictEqual(h.git(f.root, 'branch', '--show-current'), 'feat/record-failure');
  const status = h.json(f.root, 'status.js', [], f.env);
  assert.ok(status.finishRecovery, 'status exposes pending finish recovery');
  assert.strictEqual(status.finishRecovery.sessionId, f.id);
  assert.match(h.ok(f.root, 'status.js', [], f.env).out, /delivery.*pending.*finish/i);
  fs.unlinkSync(hook);
  h.ok(f.root, 'finish.js', [], f.env);
  assert.strictEqual(f.calls().filter(a => a[1] === 'create').length, 1, 'record retry reuses PR');
  h.git(f.root, 'switch', '-q', 'feat/record-failure');
  const config = JSON.parse(fs.readFileSync(f.configPath));
  assert.strictEqual(config.history.filter(e => e.event === 'session_finished').length, 1);
}

{
  const f = fixture('interrupted-record');
  const shim = path.join(f.remote, 'interrupt.js');
  fs.writeFileSync(shim, `
const fs = require('fs');
const real = fs.rmSync;
fs.rmSync = function(file, ...args) {
  const result = real.call(this, file, ...args);
  if (String(file).endsWith('.current-session')) process.exit(77);
  return result;
};
`);
  const interrupted = h.run(f.root, 'finish.js', [], { ...f.env, NODE_OPTIONS: `--require "${shim.replace(/\\/g, '/')}"` });
  assert.strictEqual(interrupted.code, 77, interrupted.err);
  h.ok(f.root, 'finish.js', [], f.env);
  assert.strictEqual(f.calls().filter(a => a[1] === 'create').length, 1);
  assert.strictEqual(h.git(f.root, 'branch', '--show-current'), 'main');
}

{
  const f = fixture('comment-interruption', true);
  const shim = path.join(f.remote, 'comment-interrupt.js');
  fs.writeFileSync(shim, `
const fs = require('fs');
const real = fs.writeFileSync;
fs.writeFileSync = function(file, content, ...args) {
  if (String(file).includes('.session-config.json') && String(content).includes('"commented": true')) {
    throw new Error('interrupted after remote comment');
  }
  return real.call(this, file, content, ...args);
};
`);
  h.assertFails(h.run(f.root, 'finish.js', ['--keep-issue'], {
    ...f.env, NODE_OPTIONS: `--require "${shim.replace(/\\/g, '/')}"`,
  }), 1, /interrupted after remote comment/);
  h.ok(f.root, 'finish.js', [], f.env);
  assert.strictEqual(f.calls().filter(a => a[0] === 'issue' && a[1] === 'comment').length, 1, 'ambiguous comment success is reconciled, never repeated');
}

{
  const f = fixture('record-push-failure');
  const hook = path.join(f.remote, 'hooks', 'pre-receive');
  fs.writeFileSync(hook, '#!/bin/sh\ncount=$(cat push-count 2>/dev/null || echo 0)\ncount=$((count + 1))\necho "$count" > push-count\nif [ "$count" = 2 ]; then echo final-push-denied >&2; exit 1; fi\n', { mode: 0o755 });
  h.assertFails(h.run(f.root, 'finish.js', [], f.env), 1, /record push failed/);
  assert.strictEqual(h.git(f.root, 'branch', '--show-current'), 'feat/record-push-failure');
  h.ok(f.root, 'finish.js', [], f.env);
  assert.strictEqual(f.calls().filter(a => a[1] === 'create').length, 1);
}

{
  const f = fixture('different-session');
  h.assertFails(h.run(f.root, 'finish.js', [], { ...f.env, FAIL_CREATE: '1' }), 1);
  h.ok(f.root, 'start.js', ['new-session'], f.env);
  const selected = h.currentSession(f.root);
  h.assertFails(h.run(f.root, 'finish.js', [], f.env), 1, /different session|another session/i);
  assert.strictEqual(h.currentSession(f.root), selected, 'recovery must not clear another session pointer');
}

{
  const root = h.gitProject('gps-invalid-session-');
  h.shipReady(root, 'invalid', ['a']);
  h.ok(root, 'ticket-start.js', ['1']);
  h.fillLog(root, '01-a');
  const configPath = h.configPath(root);
  fs.writeFileSync(configPath, '[]');
  fs.writeFileSync(path.join(root, 'a.js'), '// work\n');
  const head = h.git(root, 'rev-parse', 'HEAD');
  h.assertFails(h.run(root, 'ticket-complete.js', ['1', '--message', 'fix: a', '--file', 'a.js']), 1, /config.*object|invalid.*config/i);
  assert.strictEqual(h.git(root, 'rev-parse', 'HEAD'), head);
  assert.strictEqual(fs.readFileSync(configPath, 'utf8'), '[]');
}

h.done('finish-recovery.test.js');
