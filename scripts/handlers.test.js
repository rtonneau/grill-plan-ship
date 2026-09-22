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

{
  // No .work/sessions at all -> clear error, no stack trace
  const root = tempProject();
  const res = run(root, 'plan.js');
  assert.strictEqual(res.code, 1);
  assert.match(res.err, /No sessions found/);
  assert.doesNotMatch(res.err, /\n\s+at /);
}

console.log('handlers.test.js: all assertions passed');
