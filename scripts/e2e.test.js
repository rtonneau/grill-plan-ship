// scripts/e2e.test.js
//
// One full session through the real handlers, in a throwaway git repo:
// start -> write(grill) -> plan -> write(plan) -> ship 2 tickets -> handoff
// -> resume -> finish. After every step, /gps status must report the right
// phase and next command, and status/resume must not change a single byte
// under .work/.

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const SCRIPTS = __dirname;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-e2e-'));

function run(script, ...args) {
  const result = spawnSync(process.execPath, [path.join(SCRIPTS, script), ...args], {
    cwd: root,
    encoding: 'utf-8',
    env: { ...process.env, CLAUDE_CODE_SESSION_ID: '' },
  });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

function ok(script, ...args) {
  const res = run(script, ...args);
  assert.strictEqual(res.code, 0, `${script} ${args.join(' ')} failed:\n${res.err}`);
  return res;
}

function git(...args) {
  execFileSync('git', args, { cwd: root, stdio: 'ignore' });
}

// Hash of every file under .work/ (path + content), to prove read-only commands.
function hashWork() {
  const hash = crypto.createHash('sha256');
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else hash.update(path.relative(root, full)).update(fs.readFileSync(full));
    }
  };
  walk(path.join(root, '.work'));
  return hash.digest('hex');
}

// Runs status.js, asserts it changed nothing, and checks phase + next command.
function expectStatus(phase, command) {
  const before = hashWork();
  const report = JSON.parse(ok('status.js').out);
  assert.strictEqual(hashWork(), before, 'status.js modified .work/');
  assert.strictEqual(report.current.phase, phase);
  assert.strictEqual(report.current.suggestedNext.command, command);
  return report;
}

git('init', '-q');
git('config', 'user.email', 'e2e@example.com');
git('config', 'user.name', 'E2E');
fs.writeFileSync(path.join(root, 'app.js'), 'console.log(1);\n');
git('add', 'app.js');
git('commit', '-q', '-m', 'initial');

// start
ok('start-session.js', 'Add Dark Mode');
const sessionId = fs.readFileSync(path.join(root, '.work', 'sessions', '.current-session'), 'utf-8');
assert.match(sessionId, /^\d{4}-\d{2}-\d{2}__add-dark-mode$/);
const sessionDir = path.join(root, '.work', 'sessions', sessionId);
expectStatus('grill', '/gps write');

// write (grill)
assert.strictEqual(JSON.parse(ok('write-target.js').out).target, 'grill');
fs.writeFileSync(path.join(sessionDir, '01-grill', 'resume.md'), '# Resume\n\nApproved design.\n');
expectStatus('plan-not-started', '/gps plan');

// plan
ok('plan.js');
expectStatus('plan', '/gps write');
assert.strictEqual(run('ticket.js', '1').code, 1, 'ticket must refuse while stubs exist');

// write (plan)
assert.strictEqual(JSON.parse(ok('write-target.js').out).target, 'plan');
const ticketsDir = path.join(sessionDir, '02-plan', 'tickets');
fs.writeFileSync(path.join(sessionDir, '02-plan', 'plan.md'), '# Plan\n\nTwo tickets.\n');
for (const f of fs.readdirSync(ticketsDir)) fs.unlinkSync(path.join(ticketsDir, f));
fs.writeFileSync(path.join(ticketsDir, '01-toggle.md'), '# Ticket 01: toggle\n\nAdd the toggle.\n');
fs.writeFileSync(path.join(ticketsDir, '02-persist.md'), '# Ticket 02: persist\n\nPersist the choice.\n');
ok('mark-plan-written.js');
let report = expectStatus('ship', '/gps ship');
assert.strictEqual(report.current.nextPending.slug, 'toggle');

// ship: each ticket -> implement, mark Done, commit
for (const [num, slug] of [['1', 'toggle'], ['2', 'persist']]) {
  const queue = JSON.parse(ok('ticket-queue.js').out);
  assert.strictEqual(queue.nextPending.slug, slug);
  ok('ticket.js', num);
  const log = path.join(sessionDir, '03-implement', `0${num}-${slug}`, 'commit-log.md');
  fs.writeFileSync(path.join(root, `${slug}.js`), `// ${slug}\n`);
  git('add', `${slug}.js`);
  git('commit', '-q', '-m', `feat: ${slug}`);
  fs.writeFileSync(log, fs.readFileSync(log, 'utf-8').replace(/^\*\*Status:\*\*.*$/m, '**Status:** ✅ Done'));
}
report = expectStatus('finish-pending', '/gps finish');
// project-wide commits since the session started (the "initial" commit may share its second)
assert.ok(report.current.gitLog.some((line) => line.includes('feat: persist')));
assert.ok(report.current.gitLog.some((line) => line.includes('feat: toggle')));

// handoff writes HANDOFF.md; resume is read-only
fs.writeFileSync(path.join(root, 'wip.js'), '// uncommitted\n');
const handoff = JSON.parse(ok('handoff.js').out.split('\n').slice(1).join('\n').split('\n\nFill in')[0]);
assert.ok(handoff.gitStatus.project.some((e) => e.path === 'wip.js'));
assert.ok(fs.existsSync(path.join(sessionDir, 'HANDOFF.md')));
const beforeResume = hashWork();
const resume = JSON.parse(ok('resume.js').out);
assert.strictEqual(hashWork(), beforeResume, 'resume.js modified .work/');
assert.strictEqual(resume.live.currentPhase, 'finish-pending');
assert.strictEqual(resume.drift, null);

// finish
const finish = ok('finish.js');
assert.match(finish.out, /UNFINISHED_SESSIONS \[\]/);
const index = fs.readFileSync(path.join(sessionDir, 'INDEX.md'), 'utf-8');
assert.match(index, /✅ 01 toggle/);
assert.match(index, /✅ 02 persist/);
assert.ok(!fs.existsSync(path.join(root, '.work', 'sessions', '.current-session')));

// after finishing: status reports no current session, still read-only
const beforeStatus = hashWork();
const after = JSON.parse(ok('status.js').out);
assert.strictEqual(hashWork(), beforeStatus);
assert.strictEqual(after.current, null);
assert.strictEqual(after.sessions[0].phase, 'finished');

fs.rmSync(root, { recursive: true, force: true });
console.log('e2e.test.js: all assertions passed');
