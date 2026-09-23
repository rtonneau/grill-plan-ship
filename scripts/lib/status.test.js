// scripts/lib/status.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { setCurrentSession } = require('./session-store');
const { buildStatusReport } = require('./status');

const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-status-'));
const sessionsDir = path.join(projectRoot, '.work', 'sessions');
fs.mkdirSync(sessionsDir, { recursive: true });

// No sessions at all -> empty list, no current session
{
  const empty = buildStatusReport(sessionsDir, projectRoot);
  assert.deepStrictEqual(empty.sessions, []);
  assert.strictEqual(empty.current, null);
  assert.strictEqual(empty.currentProblem.code, 'no-sessions');
  assert.deepStrictEqual(empty.ideas, []);
  assert.strictEqual(empty.ideasProblem, null);
  assert.strictEqual(empty.suggestedNext, undefined);
}

// Scouted ideas but no session -> ideas listed strongest first, next command is the top idea
{
  const seedsFile = path.join(sessionsDir, '.pending-seeds.json');
  const seeds = {
    'maybe-later': { strength: 'Speculative', problem: 'M4: drift', sourceReport: 'scout-reports/r.md' },
    'second-strong': { strength: 'Strong', problem: 'H2: mixed config' },
    'test-harness': { strength: 'Worth exploring', problem: 'L6: no CI' },
    'safe-linker': { strength: 'Strong', severity: 'Critical', problem: 'C1, H1: data loss', sourcePath: 'docs/review.md' },
  };
  fs.writeFileSync(seedsFile, JSON.stringify(seeds));
  const scouted = buildStatusReport(sessionsDir, projectRoot);
  assert.deepStrictEqual(scouted.sessions, []);
  assert.deepStrictEqual(scouted.ideas.map((i) => i.slug), ['second-strong', 'safe-linker', 'test-harness', 'maybe-later']);
  const safe = scouted.ideas[1];
  assert.strictEqual(safe.severity, 'Critical');
  assert.strictEqual(safe.sourcePath, 'docs/review.md');
  assert.strictEqual(safe.startCommand, '/gps start safe-linker');
  assert.strictEqual(scouted.suggestedNext.command, '/gps start second-strong');
  assert.match(scouted.suggestedNext.why, /4 scouted idea/);

  // An unreadable seeds file is reported, never moved aside (status is read-only)
  fs.writeFileSync(seedsFile, '{ nope');
  const corrupt = buildStatusReport(sessionsDir, projectRoot);
  assert.deepStrictEqual(corrupt.ideas, []);
  assert.match(corrupt.ideasProblem, /unreadable/);
  assert.strictEqual(fs.readFileSync(seedsFile, 'utf-8'), '{ nope');
  fs.unlinkSync(seedsFile);
}

// Two sessions: an older completed one, and a newer one still in grill
const oldSessionId = '2026-09-10__old-feature';
const oldSessionDir = path.join(sessionsDir, oldSessionId);
fs.mkdirSync(oldSessionDir, { recursive: true });
fs.writeFileSync(
  path.join(oldSessionDir, '.session-config.json'),
  JSON.stringify({
    session_id: oldSessionId,
    feature_name: 'old-feature',
    created_at: '2026-09-10T10:00:00.000Z',
    phases_completed: ['grill', 'plan', 'implement'],
    status: 'completed',
  })
);

const newSessionId = '2026-09-16__new-feature';
const newSessionDir = path.join(sessionsDir, newSessionId);
fs.mkdirSync(path.join(newSessionDir, '01-grill'), { recursive: true });
fs.writeFileSync(
  path.join(newSessionDir, '.session-config.json'),
  JSON.stringify({
    session_id: newSessionId,
    feature_name: 'new-feature',
    created_at: '2026-09-16T10:00:00.000Z',
    phases_completed: [],
    status: 'grill-in-progress',
  })
);
fs.writeFileSync(path.join(newSessionDir, '01-grill', 'resume.md'), '# {{ feature-name }}\n');

// No pointer yet -> sessions listed, current is null with a recovery hint (read-only, no fallback)
{
  const noPointer = buildStatusReport(sessionsDir, projectRoot);
  assert.strictEqual(noPointer.sessions.length, 2);
  assert.strictEqual(noPointer.current, null);
  assert.strictEqual(noPointer.currentProblem.code, 'no-pointer');
  assert.match(noPointer.currentProblem.hint, /2026-09-16__new-feature/);
  assert.ok(!fs.existsSync(path.join(sessionsDir, '.current-session')));
}

setCurrentSession(sessionsDir, newSessionId);

let report = buildStatusReport(sessionsDir, projectRoot);
assert.strictEqual(report.sessions.length, 2);
assert.deepStrictEqual(
  report.sessions.map((s) => s.sessionId).sort(),
  [newSessionId, oldSessionId].sort()
);

// Phases are computed from files: the old session is finished (legacy
// status "completed"), the new one is in grill regardless of its status field.
assert.strictEqual(report.sessions.find((s) => s.sessionId === oldSessionId).phase, 'finished');
assert.strictEqual(report.sessions.find((s) => s.sessionId === newSessionId).phase, 'grill');

// Current session detail: grill still has placeholders -> pending 'grill'
assert.strictEqual(report.current.sessionId, newSessionId);
assert.strictEqual(report.current.phase, 'grill');
assert.strictEqual(report.current.suggestedNext.command, '/gps write');
assert.strictEqual(report.current.writeTarget.target, 'grill');
assert.deepStrictEqual(report.current.tickets, []);
assert.strictEqual(report.current.nextPending, null);
assert.deepStrictEqual(report.current.gitLog, []);

// Filling in the resume and adding tickets moves the write target and
// surfaces ticket-queue state.
fs.writeFileSync(path.join(newSessionDir, '01-grill', 'resume.md'), '# new-feature\n\nDone.\n');
const ticketsDir = path.join(newSessionDir, '02-plan', 'tickets');
fs.mkdirSync(ticketsDir, { recursive: true });
fs.writeFileSync(path.join(newSessionDir, '02-plan', 'plan.md'), '# Plan\n\nNo placeholders.\n');
fs.writeFileSync(path.join(ticketsDir, '01-add-thing.md'), '# Ticket 1: add-thing\n');

report = buildStatusReport(sessionsDir, projectRoot);
assert.strictEqual(report.current.writeTarget.target, 'none');
assert.strictEqual(report.current.tickets.length, 1);
assert.strictEqual(report.current.nextPending.num, '01');
assert.strictEqual(report.current.phase, 'ship');
assert.strictEqual(report.current.suggestedNext.command, '/gps ship');

// Recent commits are read from git when the project is a repo; the test
// sandbox is a plain tempdir (no .git), so this stays an empty array
// rather than throwing.
assert.deepStrictEqual(report.current.gitLog, []);

// A real repo with a commit touching the session dir surfaces that commit.
execSync('git init -q', { cwd: projectRoot });
execSync('git config user.email "test@example.com"', { cwd: projectRoot });
execSync('git config user.name "Test"', { cwd: projectRoot });
execSync('git add .', { cwd: projectRoot });
execSync('git commit -q -m "seed session fixtures"', { cwd: projectRoot });

report = buildStatusReport(sessionsDir, projectRoot);
assert.strictEqual(report.current.gitLog.length, 1);
assert.ok(report.current.gitLog[0].includes('seed session fixtures'));

// No handoff saved yet -> hasHandoff is false.
report = buildStatusReport(sessionsDir, projectRoot);
assert.strictEqual(report.current.hasHandoff, false);

// Saving one flips it to true.
fs.writeFileSync(path.join(newSessionDir, 'HANDOFF.md'), '# Handoff\n');
report = buildStatusReport(sessionsDir, projectRoot);
assert.strictEqual(report.current.hasHandoff, true);

fs.rmSync(projectRoot, { recursive: true, force: true });
console.log('status.test.js: all assertions passed');
