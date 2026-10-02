// tests/finish.test.js — finish.js (/gps finish), without GitHub.
// Branch, PR and issue wrap-up are covered in github-flow.test.js.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const h = require('./helpers');

{
  const root = h.gitProject();
  h.ok(root, 'start.js', ['older']);
  const olderId = h.currentSession(root);
  h.ok(root, 'start.js', ['fin']);
  const id = h.currentSession(root);
  const sessionDir = h.sessionDir(root);
  const indexPath = path.join(sessionDir, 'INDEX.md');

  h.assertFails(h.run(root, 'finish.js', ['extra']), 2);
  h.assertFails(h.run(root, 'finish.js'), 1, /grill phase is not written/);
  h.writeGrill(root);
  h.ok(root, 'plan.js');
  h.assertFails(h.run(root, 'finish.js'), 1, /plan and tickets are not written/);
  const prep = h.json(root, 'write-prepare.js');
  fs.writeFileSync(prep.payloadPath, h.planPayload(prep, [{ slug: 'a' }, { slug: 'b' }]));
  h.ok(root, 'write-apply.js');
  h.completeTicket(root, 1, 'a');

  // Pending tickets -> refused, nothing changed.
  const configBefore = fs.readFileSync(h.configPath(root), 'utf-8');
  h.assertFails(h.run(root, 'finish.js'), 1, /1 of 2 ticket\(s\) not Done: 02-b/);
  assert.ok(!fs.existsSync(indexPath));
  assert.strictEqual(fs.readFileSync(h.configPath(root), 'utf-8'), configBefore);
  assert.strictEqual(h.currentSession(root), id);

  // --keep-issue on a session without an issue: ignored with a warning.
  h.completeTicket(root, 2, 'b');
  fs.appendFileSync(path.join(root, 'app.js'), '// hook log line\n');
  const res = h.ok(root, 'finish.js', ['--keep-issue']);
  assert.match(res.err, /--keep-issue ignored: this session has no GitHub issue/);
  assert.match(res.out, /✅ Session complete: .*fin/);
  assert.match(res.out, /📦 Committed 1 remaining file\(s\) \([0-9a-f]+\): app\.js/);
  assert.match(res.out, new RegExp(`Unfinished sessions: ${olderId}\\. Next: ask the user whether to switch to one \\(node .*set-current\\.js <session-id>\\)`));
  assert.strictEqual(h.git(root, 'log', '-1', '--format=%s'), `chore: commit remaining changes (gps finish ${id})`);
  const index = fs.readFileSync(indexPath, 'utf-8');
  assert.match(index, /✅ 01 a — \[spec\]\(02-plan\/tickets\/01-a\.md\) · \[log\]\(03-implement\/01-a\/commit-log\.md\)/);
  assert.match(index, /✅ 02 b/);
  assert.match(index, /## Remaining changes[\s\S]*`app\.js`/);
  assert.match(index, /## Timeline[\s\S]*\| session_finished \|/);
  for (const [, link] of index.matchAll(/\]\(([^)]+)\)/g)) assert.ok(fs.existsSync(path.join(sessionDir, link)), link);
  const config = JSON.parse(fs.readFileSync(path.join(sessionDir, '.session-config.json'), 'utf-8'));
  assert.ok(config.finished_at);
  assert.strictEqual(config.current_phase, 'finished');
  assert.ok(!fs.existsSync(path.join(h.sessionsDir(root), '.current-session')));

  // A finished session is never picked again.
  fs.writeFileSync(path.join(h.sessionsDir(root), '.current-session'), id);
  h.assertFails(h.run(root, 'finish.js'), 1, /already finished/);
  h.ok(root, 'set-current.js', [olderId]);
}

{
  // Bounded session (resume saved, no plan) may finish; no unfinished sessions left.
  const root = h.tempProject();
  h.ok(root, 'start.js', ['bounded']);
  h.writeGrill(root);
  const dir = h.sessionDir(root);
  const data = h.json(root, 'finish.js');
  assert.deepStrictEqual(data.unfinished, []);
  assert.strictEqual(data.leftover.sha, null, 'not a git repo: nothing to commit');
  assert.match(fs.readFileSync(path.join(dir, 'INDEX.md'), 'utf-8'), /Complete \(bounded: no plan or tickets\)/);
}

{
  // Bounded issue session: finish asks first, changing nothing until it has the answer.
  const root = h.tempProject();
  h.ok(root, 'start.js', ['--issue', 'Crash']);
  h.writeGrill(root);
  const config = h.readConfig(root);
  config.issue = { number: 7, url: 'https://github.com/acme/app/issues/7' };
  fs.writeFileSync(h.configPath(root), JSON.stringify(config));
  const res = h.run(root, 'finish.js');
  h.assertFails(res, 1, /reports issue #7; nothing was changed/);
  assert.match(res.err, /Ask the user "Close issue #7 as well\?", then run finish\.js --close-issue \(yes\) or --keep-issue \(no\)/);
  h.assertFails(h.run(root, 'finish.js', ['--close-issue', '--keep-issue']), 2, /not both/);
  assert.ok(!fs.existsSync(path.join(h.sessionDir(root), 'INDEX.md')));
}

h.done('finish.test.js');
