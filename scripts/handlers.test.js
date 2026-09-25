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

const PLAN_SECTIONS = ['Strategy', 'Tickets Overview', 'Sequencing Rationale', 'Risks & Mitigation', 'Assumptions'];
const GRILL_SECTIONS = [
  'Problem Statement', 'Context & Constraints', 'Success Metrics', 'Architecture & Approach',
  'Assumptions & Trade-offs', 'Open Questions', 'Notes',
];

function payloadPath(root) {
  return path.join(sessionsDir(root), currentSession(root), '.write-payload.md');
}

function sectionsPayload(headings) {
  return headings.map((h) => `## ${h}\n\n${h} content.\n`).join('\n');
}

// Simulates the plan-phase /gps write: payload -> write-apply.js.
function writePlan(root, slugs) {
  const tickets = slugs
    .map((slug, i) => `--- ticket: ${String(i + 1).padStart(2, '0')}-${slug} ---\nDo ${slug}.\n`)
    .join('\n');
  fs.writeFileSync(payloadPath(root), `**Estimated effort:** 1 day\n\n${sectionsPayload(PLAN_SECTIONS)}\n${tickets}`);
  const res = run(root, 'write-apply.js');
  assert.strictEqual(res.code, 0, res.err);
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

  // write-apply refuses without a payload and changes nothing
  const notYet = run(root, 'write-apply.js');
  assert.strictEqual(notYet.code, 1);
  assert.match(notYet.err, /No payload at/);

  // config no longer carries derived fields
  const cfg = JSON.parse(fs.readFileSync(path.join(sessionsDir(root), currentSession(root), '.session-config.json'), 'utf-8'));
  assert.strictEqual(cfg.status, undefined);
  assert.strictEqual(cfg.phases_completed, undefined);

  // F-003: re-running after the plan is written -> rejected, nothing changes
  writePlan(root, ['a']);
  const planDir = path.join(sessionsDir(root), currentSession(root), '02-plan');
  const again = run(root, 'plan.js');
  assert.strictEqual(again.code, 1);
  assert.match(again.err, /already exists/);
  assert.match(fs.readFileSync(path.join(planDir, 'plan.md'), 'utf-8'), /Strategy content./);
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
  // --from: review archived with its extension, seeds carry severity + sourcePath
  const root = tempProject();
  fs.mkdirSync(path.join(root, 'docs'));
  fs.writeFileSync(path.join(root, 'docs', 'review.md'), '# Review\n');
  const entries = path.join(root, 'entries.json');
  fs.writeFileSync(entries, JSON.stringify({
    sourceDirection: 'only Critical and High',
    candidates: [{ slug: 'safe-linking', strength: 'Strong', severity: 'Critical', problem: 'C1: p', solution: 's' }],
  }));
  const seedsFile = path.join(sessionsDir(root), '.pending-seeds.json');
  const reportsDir = path.join(sessionsDir(root), 'scout-reports');

  // Usage errors write nothing
  for (const args of [
    ['--from'],
    ['--from', 'docs/review.md'],
    ['--bogus', 'docs/review.md', entries],
    ['docs/review.md', '--from', entries],
    ['--from', 'docs/review.md', entries, 'extra'],
  ]) {
    const res = run(root, 'scout-merge.js', ...args);
    assert.strictEqual(res.code, 1, args.join(' '));
    assert.match(res.err, /Usage: node scout-merge\.js/, args.join(' '));
    assert.doesNotMatch(res.err, /\n\s+at /);
  }
  // Missing review / a directory -> clear error, nothing written
  const missing = run(root, 'scout-merge.js', '--from', 'docs/nope.md', entries);
  assert.strictEqual(missing.code, 1);
  assert.match(missing.err, /Review file not found: docs\/nope\.md/);
  const dir = run(root, 'scout-merge.js', '--from', 'docs', entries);
  assert.strictEqual(dir.code, 1);
  assert.match(dir.err, /Not a file: docs/);
  assert.ok(!fs.existsSync(seedsFile));
  assert.ok(!fs.existsSync(reportsDir));

  const res = run(root, 'scout-merge.js', '--from', 'docs/review.md', entries);
  assert.strictEqual(res.code, 0, res.err);
  const summary = JSON.parse(res.out);
  assert.match(summary.sourceReport, /^scout-reports\/review-review-.+\.md$/);
  assert.deepStrictEqual(summary.seeded.map((s) => s.severity), ['Critical']);
  const seeds = JSON.parse(fs.readFileSync(seedsFile, 'utf-8'));
  assert.strictEqual(seeds['safe-linking'].sourcePath, 'docs/review.md');
  assert.strictEqual(seeds['safe-linking'].sourceDirection, 'only Critical and High');
  assert.strictEqual(fs.readFileSync(path.join(sessionsDir(root), summary.sourceReport), 'utf-8'), '# Review\n');
}

{
  // F-010: no .work/sessions at all -> every handler gives a clear error, no stack trace
  const root = tempProject();
  for (const [script, ...args] of [
    ['plan.js'], ['ticket.js', '1'], ['finish.js'], ['write-target.js'], ['ticket-queue.js'],
    ['write-apply.js'], ['status.js'], ['token-usage.js', 'grill'], ['handoff.js'], ['resume.js'],
  ]) {
    const res = run(root, script, ...args);
    assert.strictEqual(res.code, 1, script);
    assert.match(res.err, /No sessions found/, script);
    assert.doesNotMatch(res.err, /\n\s+at /, script);
  }
}

{
  // Scouted ideas but no session -> status succeeds and lists them
  const root = tempProject();
  fs.mkdirSync(sessionsDir(root), { recursive: true });
  fs.writeFileSync(
    path.join(sessionsDir(root), '.pending-seeds.json'),
    JSON.stringify({ 'safe-linking': { strength: 'Strong', problem: 'C1: data loss', solution: 's' } })
  );
  const res = run(root, 'status.js');
  assert.strictEqual(res.code, 0, res.err);
  const report = JSON.parse(res.out);
  assert.deepStrictEqual(report.ideas.map((i) => i.slug), ['safe-linking']);
  assert.strictEqual(report.suggestedNext.command, '/gps start safe-linking');
}

{
  // F-010/F-011: pointer to a directory without a config -> clear error, no stack trace
  const root = tempProject();
  fs.mkdirSync(path.join(sessionsDir(root), 'zzz'), { recursive: true });
  fs.writeFileSync(path.join(sessionsDir(root), '.current-session'), 'zzz');
  const res = run(root, 'write-target.js');
  assert.strictEqual(res.code, 1);
  assert.match(res.err, /No sessions found/);
  assert.doesNotMatch(res.err, /\n\s+at /);

  // With a real session present, a stale pointer is reported (not followed) with a set-current hint
  run(root, 'start-session.js', 'real');
  const realId = currentSession(root);
  fs.writeFileSync(path.join(sessionsDir(root), '.current-session'), 'zzz');
  const stale = run(root, 'write-target.js');
  assert.strictEqual(stale.code, 1);
  assert.match(stale.err, /current session zzz no longer exists/);
  assert.match(stale.err, new RegExp(`Unfinished sessions: ${realId}`));
  assert.match(stale.err, /set-current\.js/);

  // No pointer at all -> no fallback to the only session
  fs.unlinkSync(path.join(sessionsDir(root), '.current-session'));
  const none = run(root, 'ticket-queue.js');
  assert.strictEqual(none.code, 1);
  assert.match(none.err, /No current session is selected/);

  // status stays read-only and still lists sessions
  const status = run(root, 'status.js');
  assert.strictEqual(status.code, 0, status.err);
  assert.strictEqual(JSON.parse(status.out).currentProblem.code, 'no-pointer');
  assert.ok(!fs.existsSync(path.join(sessionsDir(root), '.current-session')));

  // set-current recovers
  assert.strictEqual(run(root, 'set-current.js', realId).code, 0);
  assert.strictEqual(run(root, 'write-target.js').code, 0);
}

{
  // write-target prints the payload contract (and the template's headings if resume.md is gone)
  const root = tempProject();
  run(root, 'start-session.js', 'contract');
  const sessionDir = path.join(sessionsDir(root), currentSession(root));
  const grill = JSON.parse(run(root, 'write-target.js').out);
  assert.strictEqual(grill.target, 'grill');
  assert.strictEqual(grill.payloadPath, path.join(sessionDir, '.write-payload.md'));
  assert.deepStrictEqual(grill.sections, [
    'Problem Statement', 'Context & Constraints', 'Success Metrics', 'Architecture & Approach',
    'Assumptions & Trade-offs', 'Open Questions', 'Notes',
  ]);
  assert.strictEqual(grill.tokenUsage, undefined);
  assert.strictEqual(grill.ticketSeparator, undefined);

  fs.unlinkSync(path.join(sessionDir, '01-grill', 'resume.md'));
  const missing = JSON.parse(run(root, 'write-target.js').out);
  assert.strictEqual(missing.target, 'grill');
  assert.strictEqual(missing.sections.length, 7);
}

{
  // write-apply: grill phase
  const root = tempProject();
  run(root, 'start-session.js', 'applied');
  const sessionDir = path.join(sessionsDir(root), currentSession(root));
  const resume = path.join(sessionDir, '01-grill', 'resume.md');

  fs.writeFileSync(payloadPath(root), sectionsPayload(GRILL_SECTIONS).replace(/\n/g, '\r\n'));
  const res = run(root, 'write-apply.js');
  assert.strictEqual(res.code, 0, res.err);
  assert.match(res.out, /✅ Grill written for .*applied\. Next: \/gps plan/);
  const text = fs.readFileSync(resume, 'utf-8');
  assert.match(text, /^# Session: applied/);
  assert.match(text, /## Problem Statement\n\nProblem Statement content\./);
  assert.match(text, /- \*\*Total:\*\* unavailable/);
  assert.doesNotMatch(text, /gps:fill/);
  assert.ok(!fs.existsSync(payloadPath(root)));
  assert.strictEqual(JSON.parse(run(root, 'write-target.js').out).reason, 'plan-not-started');

  // nothing pending -> clear error
  const again = run(root, 'write-apply.js');
  assert.strictEqual(again.code, 1);
  assert.match(again.err, /Nothing to write/);
  assert.match(again.err, /\/gps plan/);
}

{
  // write-apply: a bad payload writes nothing and is kept; the fixed payload then succeeds
  const root = tempProject();
  run(root, 'start-session.js', 'retry');
  const sessionDir = path.join(sessionsDir(root), currentSession(root));
  const resume = path.join(sessionDir, '01-grill', 'resume.md');
  const before = fs.readFileSync(resume, 'utf-8');

  fs.writeFileSync(payloadPath(root), '## Problem Statement\n\nOnly one.\n## Bogus\n\nx\n');
  const bad = run(root, 'write-apply.js');
  assert.strictEqual(bad.code, 1);
  assert.match(bad.err, /nothing was written/);
  assert.match(bad.err, /Missing section "## Notes"/);
  assert.match(bad.err, /Unknown section "## Bogus"/);
  assert.doesNotMatch(bad.err, /\n\s+at /);
  assert.strictEqual(fs.readFileSync(resume, 'utf-8'), before);
  assert.ok(fs.existsSync(payloadPath(root)));

  fs.writeFileSync(payloadPath(root), sectionsPayload(GRILL_SECTIONS));
  assert.strictEqual(run(root, 'write-apply.js').code, 0);
}

{
  // write-apply: plan phase writes tickets, removes stubs, refuses leftover hand-written tickets
  const root = tempProject();
  run(root, 'start-session.js', 'planned-apply');
  writeResume(root);
  run(root, 'plan.js');
  const planDir = path.join(sessionsDir(root), currentSession(root), '02-plan');
  const ticketsDir = path.join(planDir, 'tickets');

  const leftover = path.join(ticketsDir, '07-old.md');
  fs.writeFileSync(leftover, '# Ticket 07: old\n\nHand-written.\n');
  fs.writeFileSync(payloadPath(root), `**Estimated effort:** 1 day\n\n${sectionsPayload(PLAN_SECTIONS)}\n--- ticket: 01-a ---\nDo a.\n`);
  assert.deepStrictEqual(JSON.parse(run(root, 'write-target.js').out).fields, ['Estimated effort']);
  const refused = run(root, 'write-apply.js');
  assert.strictEqual(refused.code, 1);
  assert.match(refused.err, /07-old\.md already exists/);
  assert.strictEqual(fs.readFileSync(leftover, 'utf-8'), '# Ticket 07: old\n\nHand-written.\n');
  assert.ok(fs.readdirSync(ticketsDir).some((f) => f.includes('[slug]')), 'stubs must survive a refused run');

  fs.unlinkSync(leftover);
  writePlan(root, ['a', 'b']);
  assert.deepStrictEqual(fs.readdirSync(ticketsDir).sort(), ['01-a.md', '02-b.md']);
  assert.strictEqual(fs.readFileSync(path.join(ticketsDir, '01-a.md'), 'utf-8'), '# Ticket 01: a\n\nDo a.\n');
  const plan = fs.readFileSync(path.join(planDir, 'plan.md'), 'utf-8');
  assert.match(plan, /^# Implementation Plan/);
  assert.match(plan, /\*\*Estimated effort:\*\* 1 day/);
  assert.match(plan, /## Strategy\n\nStrategy content\./);
  assert.doesNotMatch(plan, /gps:fill/);
  assert.strictEqual(JSON.parse(run(root, 'ticket-queue.js').out).nextPending.slug, 'a');
}

{
  // write-apply: a placeholder the payload can't reach (hand-edited header) is caught before anything is written
  const root = tempProject();
  run(root, 'start-session.js', 'atomic');
  writeResume(root);
  run(root, 'plan.js');
  const planDir = path.join(sessionsDir(root), currentSession(root), '02-plan');
  const planPath = path.join(planDir, 'plan.md');
  fs.writeFileSync(planPath, fs.readFileSync(planPath, 'utf-8').replace('# Implementation Plan', '# Implementation Plan\n\nOwner: <!-- gps:fill someone -->'));
  const planBefore = fs.readFileSync(planPath, 'utf-8');
  const stubsBefore = fs.readdirSync(path.join(planDir, 'tickets')).sort();

  fs.writeFileSync(payloadPath(root), `**Estimated effort:** 1 day\n\n${sectionsPayload(PLAN_SECTIONS)}\n--- ticket: 01-a ---\nDo a.\n`);
  const res = run(root, 'write-apply.js');
  assert.strictEqual(res.code, 1);
  assert.match(res.err, /plan\.md would still have a placeholder outside the payload's reach/);
  assert.strictEqual(fs.readFileSync(planPath, 'utf-8'), planBefore);
  assert.deepStrictEqual(fs.readdirSync(path.join(planDir, 'tickets')).sort(), stubsBefore);
  assert.ok(fs.existsSync(payloadPath(root)));
}

{
  // write-target flags a payload left over from an earlier run
  const root = tempProject();
  run(root, 'start-session.js', 'leftover');
  assert.strictEqual(JSON.parse(run(root, 'write-target.js').out).existingPayload, false);
  fs.writeFileSync(payloadPath(root), '## Problem Statement\n\nOld.\n');
  assert.strictEqual(JSON.parse(run(root, 'write-target.js').out).existingPayload, true);
}

{
  // write-apply recreates a deleted resume.md from the template
  const root = tempProject();
  run(root, 'start-session.js', 'recreated');
  const resume = path.join(sessionsDir(root), currentSession(root), '01-grill', 'resume.md');
  fs.unlinkSync(resume);
  fs.writeFileSync(payloadPath(root), sectionsPayload(GRILL_SECTIONS));
  const res = run(root, 'write-apply.js');
  assert.strictEqual(res.code, 0, res.err);
  const text = fs.readFileSync(resume, 'utf-8');
  assert.match(text, /^# Session: recreated/);
  assert.match(text, /## Notes\n\nNotes content\./);
}

{
  // ticket-done.js records the exact completion time
  const root = tempProject();
  run(root, 'start-session.js', 'done-hook');
  fs.writeFileSync(payloadPath(root), sectionsPayload(GRILL_SECTIONS));
  assert.strictEqual(run(root, 'write-apply.js').code, 0);
  const configPath = path.join(sessionsDir(root), currentSession(root), '.session-config.json');
  const history = () => JSON.parse(fs.readFileSync(configPath, 'utf-8')).history;

  // no plan yet
  const early = run(root, 'ticket-done.js', '1');
  assert.strictEqual(early.code, 1);
  assert.match(early.err, /no tickets yet/);

  assert.strictEqual(run(root, 'plan.js').code, 0);
  writePlan(root, ['a']);
  assert.strictEqual(run(root, 'ticket-done.js').code, 1, 'a number is required');
  assert.match(run(root, 'ticket-done.js', '9').err, /Ticket 9 not found/);

  // ticket.js records ticket_started once, however often it runs
  assert.strictEqual(run(root, 'ticket.js', '1').code, 0);
  assert.strictEqual(run(root, 'ticket.js', '1').code, 0);
  const started = history().filter((e) => e.event === 'ticket_started');
  assert.strictEqual(started.length, 1);
  assert.deepStrictEqual(started[0].detail, { ticket: '01-a' });
  assert.deepStrictEqual(started[0].files, ['02-plan/tickets/01-a.md', '03-implement/01-a/commit-log.md']);

  // still In Progress -> refused, nothing recorded
  const refused = run(root, 'ticket-done.js', '1');
  assert.strictEqual(refused.code, 1);
  assert.match(refused.err, /not marked Done/);
  assert.ok(!history().some((e) => e.event === 'ticket_done'));

  markDone(root, '01-a');
  const recorded = run(root, 'ticket-done.js', '1');
  assert.strictEqual(recorded.code, 0, recorded.err);
  assert.match(recorded.out, /recorded as Done/);
  const events = history().filter((e) => e.event === 'ticket_done');
  assert.strictEqual(events.length, 1);
  assert.deepStrictEqual(events[0].files, ['03-implement/01-a/commit-log.md']);
  assert.deepStrictEqual(events[0].detail, { ticket: '01-a' });
  assert.strictEqual(events[0].phase, 'finish-pending');

  // idempotent: nothing changes the second time
  const before = fs.readFileSync(configPath, 'utf-8');
  const again = run(root, 'ticket-done.js', '1');
  assert.strictEqual(again.code, 0, again.err);
  assert.match(again.out, /already recorded as Done/);
  assert.strictEqual(fs.readFileSync(configPath, 'utf-8'), before);
}

{
  // duplicate ticket numbers: each Done ticket gets its own ticket_done event
  const root = tempProject();
  run(root, 'start-session.js', 'dup-done');
  writeResume(root);
  run(root, 'plan.js');
  writePlan(root, ['x']);
  const ticketsDir = path.join(sessionsDir(root), currentSession(root), '02-plan', 'tickets');
  fs.writeFileSync(path.join(ticketsDir, '01-y.md'), '# Ticket 01: y\n\nDo y.\n');
  const configPath = path.join(sessionsDir(root), currentSession(root), '.session-config.json');
  run(root, 'ticket.js', '1');
  markDone(root, '01-x');
  assert.strictEqual(run(root, 'ticket-done.js', '1').code, 0);
  run(root, 'ticket.js', '1'); // now picks 01-y
  markDone(root, '01-y');
  assert.strictEqual(run(root, 'ticket-done.js', '1').code, 0);
  const done = JSON.parse(fs.readFileSync(configPath, 'utf-8')).history.filter((e) => e.event === 'ticket_done');
  assert.deepStrictEqual(done.map((e) => e.detail.ticket), ['01-x', '01-y']);
}

{
  // SKILL.md router: every command has a references file carrying its handler lines
  const skillDir = path.join(SCRIPTS, '..', 'skills', 'gps');
  const skill = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8');
  const listed = [...skill.matchAll(/^- `\/gps (\w+)/gm)].map((m) => m[1]).sort();
  const refsDir = path.join(skillDir, 'references');
  const files = fs.readdirSync(refsDir).map((f) => f.replace(/\.md$/, '')).sort();
  assert.deepStrictEqual(files, listed);

  const handlers = {
    scout: ['scout-merge.js'],
    start: ['start-session.js'],
    status: ['status.js'],
    handoff: ['handoff.js'],
    resume: ['resume.js'],
    write: ['write-target.js', 'write-apply.js'],
    plan: ['plan.js'],
    ticket: ['ticket.js'],
    ship: ['ticket-queue.js', 'ticket.js', 'token-usage.js'],
    finish: ['finish.js', 'set-current.js'],
  };
  assert.deepStrictEqual(Object.keys(handlers).sort(), listed);
  for (const [command, scripts] of Object.entries(handlers)) {
    const doc = fs.readFileSync(path.join(refsDir, `${command}.md`), 'utf-8');
    for (const script of scripts) {
      assert.ok(doc.includes(`node $CLAUDE_PLUGIN_ROOT/scripts/${script}`), `${command}.md must reference ${script}`);
    }
  }

  assert.ok(skill.includes('references/<command>.md'), 'SKILL.md must route to references/<command>.md');
  // the stop-on-❌ rule must leave room for write.md's fix-the-payload-and-rerun step
  assert.match(skill, /unless its references file says how to recover/);
  // bounded work skips planning, so start.md must override write-apply's "Next: /gps plan"
  assert.match(fs.readFileSync(path.join(refsDir, 'start.md'), 'utf-8'), /ignore write-apply's `Next: \/gps plan`/);
  // a leftover payload must be read before it can be overwritten
  assert.match(fs.readFileSync(path.join(refsDir, 'write.md'), 'utf-8'), /existingPayload/);
  assert.ok(skill.split('\n').length <= 70, 'SKILL.md router must stay short');
  assert.ok(fs.readFileSync(path.join(refsDir, 'write.md'), 'utf-8').split('\n').length <= 50, 'write.md must stay short');
}

console.log('handlers.test.js: all assertions passed');
