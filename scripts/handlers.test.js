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

console.log('handlers.test.js: all assertions passed');
