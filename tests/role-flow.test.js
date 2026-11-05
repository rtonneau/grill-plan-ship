// Fixture: scripts preserve parent-recorded review evidence and recovery on resume.
// Host interpretation of reports is exercised separately by live probes.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const h = require('./helpers');

for (const mode of ['inline', 'delegate']) {
  const root = h.gitProject();
  h.shipReady(root, `roles-${mode}`, ['change', 'next']);
  h.ok(root, 'ticket-start.js', ['1', '--mode', mode]);
  const base = h.git(root, 'rev-parse', 'HEAD');
  const log = h.fillLog(root, '01-change');
  fs.writeFileSync(path.join(root, 'change.js'), 'module.exports = false;\n');
  const report = `\nReview base: ${base}\nP1 change.js:1: returns false; criterion requires true.\nVerification gaps: missing regression check.\nRecovery count: 1 (correction started).\n`;
  fs.writeFileSync(log, fs.readFileSync(log, 'utf-8').replace('## Review Notes\n', `## Review Notes\n${report}`));
  const before = fs.readFileSync(log, 'utf-8');
  // Generating either host's report request cannot accept, commit or alter state.
  for (const host of ['claude', 'codex']) {
    const state = fs.readFileSync(h.configPath(root), 'utf-8');
    const data = h.json(root, 'dispatch-prompt.js', ['1', '--role', 'reviewer', '--base', base, '--host', host]);
    assert.strictEqual(data.role, 'reviewer');
    assert.strictEqual(fs.readFileSync(log, 'utf-8'), before);
    assert.strictEqual(fs.readFileSync(h.configPath(root), 'utf-8'), state);
    assert.strictEqual(h.git(root, 'rev-parse', 'HEAD'), base);
  }
  h.ok(root, 'ticket-block.js', ['1', '--reason', 'P1 change.js:1 unresolved after correction; missing regression check']);
  const blocked = fs.readFileSync(log, 'utf-8');
  assert.match(blocked, /\*\*Blocked \(/);
  assert.ok(h.history(root).some((event) => event.event === 'ticket_blocked'));
  assert.ok(blocked.includes(report));
  h.ok(root, 'ticket-start.js', ['1', '--mode', mode]);
  assert.strictEqual(fs.readFileSync(log, 'utf-8'), blocked, 'resume must not reset review evidence or recovery count');
  assert.strictEqual(h.readConfig(root).ship_mode, mode);
  assert.strictEqual(fs.existsSync(path.join(h.sessionDir(root), '03-implement', '02-next')), false);
  // New evidence resolves the blocker; only the parent's completion command marks Done.
  fs.writeFileSync(path.join(root, 'change.js'), 'module.exports = true;\n');
  fs.writeFileSync(log, fs.readFileSync(log, 'utf-8').replace('## Review Notes\n', '## Review Notes\n\nParent: criterion checked against corrected diff. P1 resolved; no gaps. Accepted.\n'));
  h.ok(root, 'ticket-complete.js', ['1', '--message', 'fix: implement change', '--file', 'change.js']);
  assert.match(fs.readFileSync(log, 'utf-8'), /Status:\*\* ✅ Done/);
  assert.ok(fs.readFileSync(log, 'utf-8').includes(report));
}
h.done('role-flow.test.js');
