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
  assert.match(res.out, new RegExp(`Unfinished sessions: ${olderId}\\. Next: ask the user whether to switch to one \\(set-current\\.js <session-id> --confirmed\\)`));
  assert.strictEqual(h.git(root, 'log', '-2', '--format=%s'), `chore(gps): finish ${id}\nchore: commit remaining changes (gps finish ${id})`);
  assert.strictEqual(h.git(root, 'status', '--porcelain', '--', '.work'), '', 'INDEX.md and the finished state are committed');
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
  h.ok(root, 'set-current.js', [olderId, '--confirmed']);
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

{
  // A session that wrote its changelog fragment: finish commits it with the
  // session record; INDEX.md and the output name the bump.
  const root = h.gitProject('gps-fin-cl-');
  h.shipReady(root, 'Add thing', ['a']);
  h.completeTicket(root, 1, 'a');
  const id = h.currentSession(root);
  const prep = h.json(root, 'changelog-prepare.js');
  fs.writeFileSync(prep.payloadPath, '- Thing added\n- Other thing\n');
  h.ok(root, 'changelog-apply.js', ['--bump', 'major', '--reason', 'removes x']);
  const res = h.ok(root, 'finish.js');
  assert.match(res.out, /📝 Changelog: major \(2 bullet\(s\)\)/);
  assert.doesNotMatch(res.out, /CHANGELOG\.md/);
  assert.strictEqual(h.git(root, 'log', '-1', '--format=%s'), `chore(gps): finish ${id}`);
  assert.match(h.git(root, 'show', '--name-only', '--format=', 'HEAD'), new RegExp(`^\\.work/changelog/${id}\\.md$`, 'm'));
  assert.ok(!fs.existsSync(path.join(root, 'CHANGELOG.md')));
  const sessionDir = path.join(h.sessionsDir(root), id);
  const index = fs.readFileSync(path.join(sessionDir, 'INDEX.md'), 'utf-8');
  assert.match(index, new RegExp(`## Changelog\\n\\n- \\*\\*Bump:\\*\\* major\\n- \\*\\*Reason:\\*\\* removes x\\n- \\*\\*Fragment:\\*\\* \\[${id}\\.md\\]\\(\\.\\./\\.\\./changelog/${id}\\.md\\) \\(merged into the CHANGELOG at release\\)\\n`));
  for (const [, link] of index.matchAll(/\]\(([^)]+)\)/g)) assert.ok(fs.existsSync(path.join(sessionDir, link)), link);

  // Without a changelog entry: no section, no line.
  const plain = h.gitProject('gps-fin-nocl-');
  h.shipReady(plain, 'Plain', ['a']);
  h.completeTicket(plain, 1, 'a');
  const out = h.ok(plain, 'finish.js').out;
  assert.doesNotMatch(out, /CHANGELOG/);
}

{
  // Scratch cleanup on finish, per scratch.cleanupOnFinish in .work/gps-config.json.
  // A finished session with a build tree and an evidence file in its scratch dir.
  const sessionConfig = (root, id) => JSON.parse(fs.readFileSync(path.join(h.sessionsDir(root), id, '.session-config.json'), 'utf-8'));
  const finished = (name, scratch, args = []) => {
    const root = h.gitProject(`gps-fin-sc-${name}-`);
    h.shipReady(root, 'Scratchy', ['a']);
    h.completeTicket(root, 1, 'a');
    const id = h.currentSession(root);
    const scratchDir = path.join(root, '.scratch', 'tests', id);
    fs.mkdirSync(path.join(scratchDir, 'build'), { recursive: true });
    fs.mkdirSync(path.join(scratchDir, 'evidence'), { recursive: true });
    fs.writeFileSync(path.join(scratchDir, 'build', 'obj.bin'), 'x'.repeat(2048));
    fs.writeFileSync(path.join(scratchDir, 'evidence', 'run.log'), 'ok\n');
    if (scratch) {
      fs.writeFileSync(path.join(root, '.work', 'gps-config.json'),
        JSON.stringify({ github: { enabled: false }, scratch: { cleanupOnFinish: scratch } }));
    }
    const data = h.json(root, 'finish.js', args);
    return { root, id, scratchDir, data, events: sessionConfig(root, id).history.map((e) => e.event) };
  };

  // Default policy (build-artifacts): the build tree goes, the evidence stays.
  const def = finished('default');
  assert.ok(!fs.existsSync(path.join(def.scratchDir, 'build')));
  assert.strictEqual(fs.readFileSync(path.join(def.scratchDir, 'evidence', 'run.log'), 'utf-8'), 'ok\n');
  assert.strictEqual(def.data.scratch.policy, 'build-artifacts');
  assert.deepStrictEqual(def.data.scratch.removed, [`.scratch/tests/${def.id}/build`]);
  assert.strictEqual(def.data.scratch.freedBytes, 2048);
  assert.deepStrictEqual(def.data.scratch.failures, []);
  assert.ok(def.events.indexOf('session_finished') < def.events.indexOf('scratch_cleaned'));
  const cleaned = sessionConfig(def.root, def.id).history.find((e) => e.event === 'scratch_cleaned');
  assert.deepStrictEqual(cleaned.detail, { policy: 'build-artifacts', removed: [`.scratch/tests/${def.id}/build`], freedBytes: 2048 });
  assert.strictEqual(h.git(def.root, 'status', '--porcelain', '--', '.work'), '', 'the scratch_cleaned event is committed');
  assert.match(h.git(def.root, 'show', 'HEAD:.work/sessions/' + def.id + '/.session-config.json'), /scratch_cleaned/);

  // Human output: one line.
  const text = finished('text');
  assert.ok(text.data.scratch.removed.length === 1);
  const again = h.gitProject('gps-fin-sc-out-');
  h.shipReady(again, 'Out', ['a']);
  h.completeTicket(again, 1, 'a');
  const sid = h.currentSession(again);
  fs.mkdirSync(path.join(again, '.scratch', 'tests', sid, 'build'), { recursive: true });
  fs.writeFileSync(path.join(again, '.scratch', 'tests', sid, 'build', 'o'), 'x');
  assert.match(h.ok(again, 'finish.js').out, /🧹 Scratch: removed 1 build tree\(s\), freed 1 B \(policy build-artifacts\)/);

  // none: everything kept, no event, no line.
  const none = finished('none', 'none');
  assert.ok(fs.existsSync(path.join(none.scratchDir, 'build', 'obj.bin')));
  assert.ok(!none.events.includes('scratch_cleaned'));
  assert.deepStrictEqual(none.data.scratch.removed, []);

  // all: the whole session scratch dir goes.
  const all = finished('all', 'all');
  assert.ok(!fs.existsSync(all.scratchDir));
  assert.deepStrictEqual(all.data.scratch.removed, [`.scratch/tests/${all.id}`]);
  assert.ok(all.events.includes('scratch_cleaned'));

  // Nothing to remove (no scratch dir at all): no event.
  const bare = h.gitProject('gps-fin-sc-bare-');
  h.shipReady(bare, 'Bare', ['a']);
  h.completeTicket(bare, 1, 'a');
  fs.rmSync(path.join(bare, '.scratch'), { recursive: true, force: true });
  const bareId = h.currentSession(bare);
  const bareRes = h.json(bare, 'finish.js');
  assert.deepStrictEqual(bareRes.scratch.removed, []);
  assert.ok(!sessionConfig(bare, bareId).history.some((e) => e.event === 'scratch_cleaned'));

  // A refused finish (ticket not Done) touches no scratch file.
  const refused = h.gitProject('gps-fin-sc-refused-');
  h.shipReady(refused, 'Refused', ['a', 'b']);
  h.completeTicket(refused, 1, 'a');
  const rid = h.currentSession(refused);
  const rBuild = path.join(refused, '.scratch', 'tests', rid, 'build');
  fs.mkdirSync(rBuild, { recursive: true });
  fs.writeFileSync(path.join(rBuild, 'obj.bin'), 'x');
  h.assertFails(h.run(refused, 'finish.js'), 1, /not Done/);
  assert.ok(fs.existsSync(path.join(rBuild, 'obj.bin')));
}

h.done('finish.test.js');
