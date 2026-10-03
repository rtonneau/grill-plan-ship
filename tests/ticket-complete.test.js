// tests/ticket-complete.test.js — ticket-complete.js (/gps ship: commit + mark Done)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const h = require('./helpers');

{
  const root = h.gitProject();
  h.shipReady(root, 'complete', ['a', 'b']);
  const log = path.join(h.sessionDir(root), '03-implement', '01-a', 'commit-log.md');
  const commit = (args) => h.run(root, 'ticket-complete.js', ['1', ...args]);
  fs.writeFileSync(path.join(root, 'a.js'), 'a\n');

  // Usage errors: exit 2.
  h.assertFails(h.run(root, 'ticket-complete.js'), 2);
  h.assertFails(h.run(root, 'ticket-complete.js', ['x', '--message', 'm', '--file', 'a.js']), 2, /Invalid ticket number/);
  h.assertFails(commit(['--message', 'm']), 2, /at least one --file/);
  h.assertFails(commit(['--file', 'a.js']), 2, /--message/);
  h.assertFails(commit(['--commit', 'abc', '--file', 'a.js']), 2, /leave out --message and --file/);
  h.assertFails(commit(['--message', 'm', '--file', '../outside.js']), 2, /outside the project/);
  h.assertFails(commit(['--message', 'm', '--file', '.work/x']), 2, /never belongs in a ticket's commit/);

  // Never started -> refused.
  h.assertFails(commit(['--message', 'm', '--file', 'a.js']), 1, /never started[\s\S]*ticket-start\.js 1/);

  // Narrative sections not filled -> refused, nothing committed.
  h.ok(root, 'ticket-start.js', ['1']);
  const head = h.git(root, 'rev-parse', 'HEAD');
  h.assertFails(commit(['--message', 'm', '--file', 'a.js']),
    1, /Fill these sections .*: Local Test Result, Review Notes, Blockers \/ Challenges\. Nothing was committed/);
  assert.strictEqual(h.git(root, 'rev-parse', 'HEAD'), head);

  // A failed commit (pre-commit hook) leaves the ticket In Progress.
  h.fillLog(root, '01-a');
  const hook = path.join(root, '.git', 'hooks', 'pre-commit');
  fs.writeFileSync(hook, '#!/bin/sh\necho "lint failed" >&2\nexit 1\n', { mode: 0o755 });
  h.assertFails(commit(['--message', 'feat: a', '--file', 'a.js']), 1, /Commit failed \(lint failed\); the ticket stays In Progress[\s\S]*--commit <sha>/);
  assert.match(fs.readFileSync(log, 'utf-8'), /\*\*Status:\*\* In Progress/);
  fs.rmSync(hook);

  // Success: only the named file is committed; the log is completed; the event recorded.
  fs.writeFileSync(path.join(root, 'unrelated.js'), 'not ours\n');
  h.git(root, 'add', 'unrelated.js');
  const res = h.ok(root, 'ticket-complete.js', ['1', '--message', 'feat: a (ticket 01)', '--file', 'a.js']);
  assert.match(res.out, /✅ Ticket 01 \(a\) done: committed [0-9a-f]+ \(1 file\(s\)\)\.\n🗂️ {2}Session record committed \([0-9a-f]+\): \d+ file\(s\) in \.work\/\nNext: ticket 02 \(b\)/);
  assert.strictEqual(h.git(root, 'log', '-2', '--format=%s'), 'chore(gps): ticket 01-a done\nfeat: a (ticket 01)');
  assert.strictEqual(h.git(root, 'show', '--name-only', '--format=', 'HEAD~1'), 'a.js');
  assert.ok(h.git(root, 'show', '--name-only', '--format=', 'HEAD').split('\n').every((f) => f.startsWith('.work/')), 'the record commit holds .work/ only');
  assert.match(h.git(root, 'show', '--name-only', '--format=', 'HEAD'), /03-implement\/01-a\/commit-log\.md/);
  assert.strictEqual(h.git(root, 'status', '--porcelain', '--', '.work'), '');
  assert.strictEqual(h.git(root, 'diff', '--cached', '--name-only'), 'unrelated.js', 'other staged files stay staged');
  const text = fs.readFileSync(log, 'utf-8');
  assert.match(text, /\*\*Status:\*\* ✅ Done/);
  assert.match(text, /## Commits\n\n- [0-9a-f]{7,} feat: a \(ticket 01\)/);
  assert.match(text, /## Time Spent\n\n\d+m \(ticket-start\.js to ticket-complete\.js\)/);
  assert.doesNotMatch(text, /Token Usage/);
  assert.match(text, /## Review Notes\n\nChecked\./, 'the narrative is kept');
  const event = h.history(root).filter((e) => e.event === 'ticket_done');
  assert.strictEqual(event.length, 1);
  assert.deepStrictEqual(event[0].files, ['03-implement/01-a/commit-log.md']);
  assert.strictEqual(event[0].detail.ticket, '01-a');
  assert.strictEqual(event[0].detail.commit, h.git(root, 'rev-parse', '--short', 'HEAD~1'));

  // Idempotent: a completed ticket is left alone.
  const before = fs.readFileSync(h.configPath(root), 'utf-8');
  assert.match(h.ok(root, 'ticket-complete.js', ['1', '--message', 'x', '--file', 'a.js']).out, /already Done; nothing was changed/);
  assert.strictEqual(fs.readFileSync(h.configPath(root), 'utf-8'), before);

  // --commit records an existing commit instead.
  h.ok(root, 'ticket-start.js', ['2']);
  h.fillLog(root, '02-b');
  fs.writeFileSync(path.join(root, 'b.js'), 'b\n');
  h.git(root, 'add', 'b.js');
  h.git(root, 'commit', '-q', '-m', 'feat: b by hand');
  h.assertFails(h.run(root, 'ticket-complete.js', ['2', '--commit', 'deadbeef']), 1, /Commit deadbeef not found/);
  const data = h.json(root, 'ticket-complete.js', ['2', '--commit', 'HEAD']);
  assert.strictEqual(data.ticket, '02-b');
  assert.strictEqual(data.commit, h.git(root, 'rev-parse', '--short', 'HEAD~1'), 'HEAD is resolved to its sha (HEAD~1 now: the record commit follows)');
  assert.strictEqual(data.nextPending, null);
  assert.match(fs.readFileSync(path.join(h.sessionDir(root), '03-implement', '02-b', 'commit-log.md'), 'utf-8'), /- [0-9a-f]+ feat: b by hand/);
  assert.strictEqual(h.json(root, 'status.js').current.phase, 'finish-pending');
}

{
  // Duplicate numbers: each ticket gets its own completion.
  const root = h.gitProject();
  h.shipReady(root, 'dup-done', ['x']);
  fs.writeFileSync(path.join(h.sessionDir(root), '02-plan', 'tickets', '01-y.md'), '# Ticket 01: y\n\nDo y.\n');
  h.completeTicket(root, 1, 'x');
  h.completeTicket(root, 1, 'y');
  assert.deepStrictEqual(h.history(root).filter((e) => e.event === 'ticket_done').map((e) => e.detail.ticket), ['01-x', '01-y']);
}

h.done('ticket-complete.test.js');
