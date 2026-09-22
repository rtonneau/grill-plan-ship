// scripts/handlers.test.js
//
// Runs the real handler scripts in throwaway project directories and
// checks exit codes, output and files — the reproductions from
// docs/reviews/2026-09-22-mvp-hardening-review.md.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPTS = __dirname;

function run(cwd, script, ...args) {
  const result = spawnSync(process.execPath, [path.join(SCRIPTS, script), ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, CLAUDE_CODE_SESSION_ID: '' },
  });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

function tempProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gps-handlers-'));
}

function sessionsDir(root) {
  return path.join(root, '.work', 'sessions');
}

function currentSession(root) {
  return fs.readFileSync(path.join(sessionsDir(root), '.current-session'), 'utf-8').trim();
}

// ---------------------------------------------------------------- start

{
  const root = tempProject();
  const first = run(root, 'start-session.js', 'feat');
  assert.strictEqual(first.code, 0, first.err);
  const id = currentSession(root);
  assert.match(id, /^\d{4}-\d{2}-\d{2}__feat$/);

  // .work/ and .scratch/ are gitignored
  const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf-8');
  assert.match(gitignore, /^\.work\/$/m);
  assert.match(gitignore, /^\.scratch\/$/m);

  // F-001: re-running start never touches the existing session
  const resumePath = path.join(sessionsDir(root), id, '01-grill', 'resume.md');
  fs.writeFileSync(resumePath, 'FILLED');
  const configBefore = fs.readFileSync(path.join(sessionsDir(root), id, '.session-config.json'), 'utf-8');
  const again = run(root, 'start-session.js', 'feat');
  assert.strictEqual(again.code, 1);
  assert.match(again.err, /already exists/);
  assert.doesNotMatch(again.err, /\n\s+at /); // no stack trace
  assert.strictEqual(fs.readFileSync(resumePath, 'utf-8'), 'FILLED');
  assert.strictEqual(fs.readFileSync(path.join(sessionsDir(root), id, '.session-config.json'), 'utf-8'), configBefore);
}

{
  // F-002: traversal names are cleaned and stay inside .work/sessions
  const root = tempProject();
  const target = `escaped-${process.pid}-${Date.now()}`;
  const res = run(root, 'start-session.js', `x/../../../../${target}`);
  assert.strictEqual(res.code, 0, res.err);
  assert.match(res.out, new RegExp(`cleaned to "x-${target}"`));
  assert.match(currentSession(root), new RegExp(`__x-${target}$`));
  assert.ok(fs.existsSync(path.join(sessionsDir(root), currentSession(root), '.session-config.json')));
  assert.ok(!fs.existsSync(path.join(root, '..', target)));

  // Windows-illegal characters and empty names
  const bad = run(root, 'start-session.js', 'a:b?c');
  assert.strictEqual(bad.code, 0, bad.err);
  assert.match(currentSession(root), /__a-b-c$/);
  const empty = run(root, 'start-session.js', '!!!');
  assert.strictEqual(empty.code, 0, empty.err);
  assert.match(currentSession(root), /__untitled-\d{6}$/);

  // Missing argument
  const none = run(root, 'start-session.js');
  assert.strictEqual(none.code, 1);
  assert.match(none.err, /Usage: \/gps start/);
}

// Simulates the grill-phase /gps write: fills resume.md.
function writeResume(root) {
  const id = currentSession(root);
  fs.writeFileSync(path.join(sessionsDir(root), id, '01-grill', 'resume.md'), '# Resume\n\nApproved.\n');
}

// Simulates the plan-phase /gps write: real plan.md, stubs replaced by
// real tickets, then mark-plan-written.js.
function writePlan(root, slugs) {
  const planDir = path.join(sessionsDir(root), currentSession(root), '02-plan');
  fs.writeFileSync(path.join(planDir, 'plan.md'), '# Plan\n\nREAL PLAN\n');
  const ticketsDir = path.join(planDir, 'tickets');
  for (const f of fs.readdirSync(ticketsDir)) fs.unlinkSync(path.join(ticketsDir, f));
  slugs.forEach((slug, i) => {
    const num = String(i + 1).padStart(2, '0');
    fs.writeFileSync(path.join(ticketsDir, `${num}-${slug}.md`), `# Ticket ${num}: ${slug}\n\nDo ${slug}.\n`);
  });
  assert.strictEqual(run(root, 'mark-plan-written.js').code, 0);
}

// Marks a ticket's commit-log.md as done, as /gps ship does on success.
function markDone(root, implName) {
  const log = path.join(sessionsDir(root), currentSession(root), '03-implement', implName, 'commit-log.md');
  const content = fs.readFileSync(log, 'utf-8').replace(/^\*\*Status:\*\*.*$/m, '**Status:** ✅ Done');
  fs.writeFileSync(log, content + '\nCOMMIT abc123\n');
  return log;
}

// ----------------------------------------------------------------- plan

{
  const root = tempProject();
  run(root, 'start-session.js', 'planned');

  // plan before grill is written -> rejected
  const early = run(root, 'plan.js');
  assert.strictEqual(early.code, 1);
  assert.match(early.err, /placeholders/);

  writeResume(root);
  assert.strictEqual(run(root, 'plan.js').code, 0);

  // re-running while the plan is still pending -> rejected, points at /gps write
  const pending = run(root, 'plan.js');
  assert.strictEqual(pending.code, 1);
  assert.match(pending.err, /\/gps write/);

  // F-003: re-running after the plan is written -> rejected, nothing changes
  writePlan(root, ['a']);
  const planDir = path.join(sessionsDir(root), currentSession(root), '02-plan');
  const again = run(root, 'plan.js');
  assert.strictEqual(again.code, 1);
  assert.match(again.err, /already exists/);
  assert.match(fs.readFileSync(path.join(planDir, 'plan.md'), 'utf-8'), /REAL PLAN/);
  assert.deepStrictEqual(fs.readdirSync(path.join(planDir, 'tickets')), ['01-a.md']);
}

// --------------------------------------------------------------- ticket

{
  const root = tempProject();
  run(root, 'start-session.js', 'tickets');

  // F-010: no plan yet -> clear error, no stack trace
  const noPlan = run(root, 'ticket.js', '1');
  assert.strictEqual(noPlan.code, 1);
  assert.match(noPlan.err, /no tickets yet/);
  assert.doesNotMatch(noPlan.err, /\n\s+at /);

  writeResume(root);
  run(root, 'plan.js');

  // F-006: stubs exist but plan not written -> refuse instead of picking 01-[slug]
  const stub = run(root, 'ticket.js', '1');
  assert.strictEqual(stub.code, 1);
  assert.match(stub.err, /\/gps write/);

  writePlan(root, ['a', 'b']);

  // invalid numbers
  assert.strictEqual(run(root, 'ticket.js', 'abc').code, 1);
  assert.strictEqual(run(root, 'ticket.js').code, 1);
  assert.match(run(root, 'ticket.js', '9').err, /Ticket 9 not found/);

  // "001" and "1" both find ticket 01
  const first = run(root, 'ticket.js', '001');
  assert.strictEqual(first.code, 0, first.err);
  assert.match(first.out, /Do a\./);

  // unfinished ticket: existing log is kept, spec printed again
  const logPath = path.join(sessionsDir(root), currentSession(root), '03-implement', '01-a', 'commit-log.md');
  fs.appendFileSync(logPath, '\nWORK IN PROGRESS NOTES\n');
  const resumeTicket = run(root, 'ticket.js', '1');
  assert.strictEqual(resumeTicket.code, 0, resumeTicket.err);
  assert.match(resumeTicket.out, /existing log kept/);
  assert.match(fs.readFileSync(logPath, 'utf-8'), /WORK IN PROGRESS NOTES/);

  // F-004: a Done ticket is never reset
  markDone(root, '01-a');
  const doneBefore = fs.readFileSync(logPath, 'utf-8');
  const again = run(root, 'ticket.js', '1');
  assert.strictEqual(again.code, 0, again.err);
  assert.match(again.out, /already Done/);
  assert.strictEqual(fs.readFileSync(logPath, 'utf-8'), doneBefore);
}

{
  // Duplicate numbers: all valid; first not-done in alphabetical order is picked
  const root = tempProject();
  run(root, 'start-session.js', 'dups');
  writeResume(root);
  run(root, 'plan.js');
  writePlan(root, ['x']);
  const ticketsDir = path.join(sessionsDir(root), currentSession(root), '02-plan', 'tickets');
  fs.writeFileSync(path.join(ticketsDir, '01-y.md'), '# Ticket 01: y\n\nDo y.\n');
  assert.match(run(root, 'ticket.js', '1').out, /Do x\./);
  markDone(root, '01-x');
  assert.match(run(root, 'ticket.js', '1').out, /Do y\./);
}

// --------------------------------------------------------------- finish

{
  const root = tempProject();
  run(root, 'start-session.js', 'older');
  const olderId = currentSession(root);
  run(root, 'start-session.js', 'fin');
  const id = currentSession(root);
  const sessionDir = path.join(sessionsDir(root), id);
  const indexPath = path.join(sessionDir, 'INDEX.md');

  // grill not written -> refused
  assert.match(run(root, 'finish.js').err, /grill phase is not written/);

  writeResume(root);
  run(root, 'plan.js');
  // plan pending -> refused
  assert.match(run(root, 'finish.js').err, /plan and tickets are not written/);

  writePlan(root, ['a', 'b']);
  run(root, 'ticket.js', '1');
  markDone(root, '01-a');

  // F-005: pending tickets -> refused, nothing changed
  const indexBefore = fs.readFileSync(indexPath, 'utf-8');
  const pending = run(root, 'finish.js');
  assert.strictEqual(pending.code, 1);
  assert.match(pending.err, /1 of 2 ticket\(s\) not Done: 02-b/);
  assert.strictEqual(fs.readFileSync(indexPath, 'utf-8'), indexBefore);
  assert.strictEqual(currentSession(root), id);

  run(root, 'ticket.js', '2');
  markDone(root, '02-b');
  const done = run(root, 'finish.js');
  assert.strictEqual(done.code, 0, done.err);
  const index = fs.readFileSync(indexPath, 'utf-8');
  assert.match(index, /✅ 01 a/);
  assert.match(index, /✅ 02 b/);
  const config = JSON.parse(fs.readFileSync(path.join(sessionDir, '.session-config.json'), 'utf-8'));
  assert.ok(config.finished_at);
  // pointer cleared, unfinished sessions listed
  assert.ok(!fs.existsSync(path.join(sessionsDir(root), '.current-session')));
  const listed = JSON.parse(done.out.match(/UNFINISHED_SESSIONS (.*)/)[1]);
  assert.deepStrictEqual(listed.map((s) => s.sessionId), [olderId]);

  // finished session is not picked implicitly; finishing it again is an error
  assert.strictEqual(run(root, 'set-current.js', id).code, 1);
  fs.writeFileSync(path.join(sessionsDir(root), '.current-session'), id);
  const twice = run(root, 'finish.js');
  assert.strictEqual(twice.code, 1);
  assert.match(twice.err, /already finished/);

  // set-current switches to an unfinished session and rejects bad ids
  const switched = run(root, 'set-current.js', olderId);
  assert.strictEqual(switched.code, 0, switched.err);
  assert.strictEqual(currentSession(root), olderId);
  assert.strictEqual(run(root, 'set-current.js', '../../x').code, 1);
  assert.strictEqual(run(root, 'set-current.js', '2026-01-01__missing').code, 1);
}

{
  // Bounded session: resume written, no plan -> may finish
  const root = tempProject();
  run(root, 'start-session.js', 'bounded');
  writeResume(root);
  const res = run(root, 'finish.js');
  assert.strictEqual(res.code, 0, res.err);
  assert.match(fs.readFileSync(path.join(sessionsDir(root), fs.readdirSync(sessionsDir(root)).find((f) => f.endsWith('__bounded')), 'INDEX.md'), 'utf-8'), /bounded/);
}

// ---------------------------------------------------------------- scout

{
  const root = tempProject();
  const report = path.join(root, 'report.html');
  fs.writeFileSync(report, '<html>r</html>');
  const entries = path.join(root, 'entries.json');

  // Bad JSON -> clear error, no stack trace
  fs.writeFileSync(entries, '{');
  const badJson = run(root, 'scout-merge.js', report, entries);
  assert.strictEqual(badJson.code, 1);
  assert.match(badJson.err, /not valid JSON/);
  assert.doesNotMatch(badJson.err, /\n\s+at /);

  // F-008: a corrupt seeds file is kept aside, not overwritten
  const seedsFile = path.join(sessionsDir(root), '.pending-seeds.json');
  fs.mkdirSync(sessionsDir(root), { recursive: true });
  fs.writeFileSync(seedsFile, '{bad');
  fs.writeFileSync(entries, JSON.stringify({
    candidates: [
      { slug: 'a-b', strength: 'Strong', problem: 'p', solution: 's' },
      { slug: 'a-b', strength: 'Strong', problem: 'p2', solution: 's' },
    ],
  }));
  const ok = run(root, 'scout-merge.js', report, entries);
  assert.strictEqual(ok.code, 0, ok.err);
  assert.match(ok.err, /moved to \.pending-seeds\.json\.corrupt-/);
  assert.match(ok.err, /Duplicate slug "a-b"/);
  const quarantined = fs.readdirSync(sessionsDir(root)).find((f) => f.includes('.corrupt-'));
  assert.strictEqual(fs.readFileSync(path.join(sessionsDir(root), quarantined), 'utf-8'), '{bad');

  // Invalid candidate -> exit 1
  fs.writeFileSync(entries, JSON.stringify({ candidates: [{ slug: 'only-slug' }] }));
  const invalid = run(root, 'scout-merge.js', report, entries);
  assert.strictEqual(invalid.code, 1);
  assert.match(invalid.err, /Invalid strength/);

  // Seed consumed by /gps start; the report copy is untouched
  const reportsDir = path.join(sessionsDir(root), 'scout-reports');
  const reportCopy = path.join(reportsDir, fs.readdirSync(reportsDir)[0]);
  const started = run(root, 'start-session.js', 'a-b');
  assert.strictEqual(started.code, 0, started.err);
  assert.match(started.out, /Scout seed found for "a-b"/);
  assert.doesNotMatch(fs.readFileSync(seedsFile, 'utf-8'), /"a-b"/);
  assert.strictEqual(fs.readFileSync(reportCopy, 'utf-8'), '<html>r</html>');
}

{
  // No .work/sessions at all -> clear error, no stack trace
  const root = tempProject();
  const res = run(root, 'plan.js');
  assert.strictEqual(res.code, 1);
  assert.match(res.err, /No sessions found/);
  assert.doesNotMatch(res.err, /\n\s+at /);
}

console.log('handlers.test.js: all assertions passed');
