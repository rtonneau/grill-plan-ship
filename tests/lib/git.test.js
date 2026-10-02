// tests/lib/git.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const {
  readRecentCommits, readGitStatus, commitFiles, commitExists, describeCommit,
  commitWorkDir, describeWorkCommit, branchesHolding, isIgnored,
} = require('../../skills/gps/scripts/lib/git');

const readGitStatusSummary = (root, dir) => readGitStatus(root, dir).session;

const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-git-'));
const sessionDir = path.join(projectRoot, '.work', 'sessions', '2026-09-22__test-feature');
fs.mkdirSync(sessionDir, { recursive: true });

// Not a git repo yet -> helpers degrade to empty results, never throw.
assert.deepStrictEqual(readRecentCommits(projectRoot, null), []);
assert.deepStrictEqual(readGitStatusSummary(projectRoot, sessionDir), []);
assert.deepStrictEqual(readGitStatus(projectRoot, sessionDir), { project: [], session: [] });

execSync('git init -q', { cwd: projectRoot, stdio: 'ignore' });
execSync('git config user.email "test@example.com"', { cwd: projectRoot, stdio: 'ignore' });
execSync('git config user.name "Test"', { cwd: projectRoot, stdio: 'ignore' });

// Untracked file inside the session dir shows up as a status entry.
fs.writeFileSync(path.join(sessionDir, 'notes.txt'), 'wip\n');
let statusResult = readGitStatusSummary(projectRoot, sessionDir);
assert.strictEqual(statusResult.length, 1);
assert.strictEqual(statusResult[0].indexStatus, '?');
assert.strictEqual(statusResult[0].worktreeStatus, '?');
assert.ok(statusResult[0].path.endsWith('notes.txt'));

// Commit it -> status goes clean, and the commit shows up in the log.
execSync('git add .', { cwd: projectRoot, stdio: 'ignore' });
execSync('git commit -q -m "add notes"', { cwd: projectRoot, stdio: 'ignore' });

assert.deepStrictEqual(readGitStatusSummary(projectRoot, sessionDir), []);
const log = readRecentCommits(projectRoot, null);
assert.strictEqual(log.length, 1);
assert.ok(log[0].includes('add notes'));

// Commits are project-wide (not limited to the session dir) and filtered by --since.
fs.writeFileSync(path.join(projectRoot, 'code.js'), 'x\n');
execSync('git add code.js', { cwd: projectRoot, stdio: 'ignore' });
execSync('git commit -q -m "code change outside session"', { cwd: projectRoot, stdio: 'ignore' });
assert.strictEqual(readRecentCommits(projectRoot, '2000-01-01T00:00:00.000Z')[0].includes('code change outside session'), true);
assert.deepStrictEqual(readRecentCommits(projectRoot, new Date(Date.now() + 3600 * 1000).toISOString()), []);
assert.strictEqual(readRecentCommits(projectRoot, new Date(Date.now() - 3600 * 1000).toISOString()).length, 2);
assert.strictEqual(readRecentCommits(projectRoot, null, 1).length, 1);

// Paths with shell metacharacters are passed as arguments, never through a shell.
const weirdDir = path.join(projectRoot, '.work', 'sessions', 'x$(touch pwned)`id`');
fs.mkdirSync(weirdDir, { recursive: true });
fs.writeFileSync(path.join(weirdDir, 'f.txt'), 'x\n');
assert.strictEqual(readGitStatusSummary(projectRoot, weirdDir).length, 1);
assert.ok(!fs.existsSync(path.join(projectRoot, 'pwned')));
fs.rmSync(weirdDir, { recursive: true, force: true });

// Modify the tracked file -> shows as modified, not untracked.
fs.writeFileSync(path.join(sessionDir, 'notes.txt'), 'wip again\n');
statusResult = readGitStatusSummary(projectRoot, sessionDir);
assert.strictEqual(statusResult.length, 1);
assert.strictEqual(statusResult[0].indexStatus, ' ');
assert.strictEqual(statusResult[0].worktreeStatus, 'M');

// A change outside the session dir must not leak into the scoped summary.
const outsideDir = path.join(projectRoot, 'other-dir');
fs.mkdirSync(outsideDir, { recursive: true });
fs.writeFileSync(path.join(outsideDir, 'unrelated.txt'), 'noise\n');
statusResult = readGitStatusSummary(projectRoot, sessionDir);
assert.strictEqual(statusResult.length, 1);
assert.ok(statusResult[0].path.endsWith('notes.txt'));

// readGitStatus shows both views separately; the project view leaves gps's
// own .work/ out, tracked or not.
const both = readGitStatus(projectRoot, sessionDir);
assert.strictEqual(both.session.length, 1);
assert.strictEqual(both.project.length, 1);
assert.ok(both.project.every((e) => !e.path.startsWith('.work/')));
assert.ok(both.project.some((e) => e.path.endsWith('unrelated.txt')));

// commitFiles: commits exactly the given files, nothing else that is staged.
fs.writeFileSync(path.join(projectRoot, 'code.js'), 'y\n');
fs.writeFileSync(path.join(projectRoot, 'other.js'), 'staged but not ours\n');
execSync('git add other.js', { cwd: projectRoot, stdio: 'ignore' });
const committed = commitFiles(projectRoot, ['code.js'], 'feat: only code');
assert.strictEqual(committed.ok, true, committed.reason);
assert.deepStrictEqual(committed.files, ['code.js']);
assert.ok(commitExists(projectRoot, committed.sha));
assert.match(describeCommit(projectRoot, committed.sha), /^[0-9a-f]{7,} feat: only code$/);
assert.strictEqual(execSync('git diff --cached --name-only', { cwd: projectRoot, encoding: 'utf-8' }).trim(), 'other.js');
// Nothing to commit, missing paths and non-repos are reported, never thrown.
assert.match(commitFiles(projectRoot, ['code.js'], 'again').reason, /has changes to commit/);
assert.strictEqual(commitFiles(projectRoot, ['nope.js'], 'x').ok, false);
assert.strictEqual(commitExists(projectRoot, 'deadbeef'), false);
assert.strictEqual(describeCommit(projectRoot, 'deadbeef'), null);
const notRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-norepo-'));
assert.strictEqual(commitFiles(notRepo, ['a'], 'x').reason, 'not a git repository');
fs.rmSync(notRepo, { recursive: true, force: true });

fs.rmSync(projectRoot, { recursive: true, force: true });
// commitWorkDir: .work/ in its own commit; other staged files stay staged,
// git-ignored per-machine files stay out.
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-workdir-'));
  assert.deepStrictEqual(commitWorkDir(root, 'm'), { ok: true, sha: null, files: [], skipped: 'not a git repository' });
  const sh = (cmd) => execSync(cmd, { cwd: root, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  sh('git init -q -b main');
  sh('git config user.email "test@example.com"');
  sh('git config user.name "Test"');
  fs.writeFileSync(path.join(root, 'app.js'), '1\n');
  sh('git add app.js');
  sh('git commit -q -m initial');
  assert.deepStrictEqual(commitWorkDir(root, 'm'), { ok: true, sha: null, files: [], skipped: null }, 'no .work/ yet');

  fs.mkdirSync(path.join(root, '.work', 'sessions', 's1'), { recursive: true });
  fs.writeFileSync(path.join(root, '.work', 'sessions', 's1', 'plan.md'), 'plan\n');
  fs.writeFileSync(path.join(root, '.work', 'sessions', '.current-session'), 's1');
  fs.writeFileSync(path.join(root, '.gitignore'), '.work/sessions/.current-session\n');
  fs.writeFileSync(path.join(root, 'app.js'), '2\n');
  sh('git add app.js');
  const record = commitWorkDir(root, 'chore(gps): plan s1');
  assert.ok(record.ok && record.sha);
  assert.deepStrictEqual(record.files, ['.work/sessions/s1/plan.md']);
  assert.strictEqual(sh('git log -1 --format=%s'), 'chore(gps): plan s1');
  assert.strictEqual(sh('git diff --cached --name-only'), 'app.js', 'other staged files stay staged');
  assert.match(describeWorkCommit(record).line, /Session record committed \([0-9a-f]+\): 1 file\(s\) in \.work\//);
  assert.deepStrictEqual(commitWorkDir(root, 'm'), { ok: true, sha: null, files: [], skipped: null }, 'nothing new');
  assert.deepStrictEqual(describeWorkCommit(commitWorkDir(root, 'm')), { line: null, warning: null });

  // branchesHolding finds the branch a path was committed on.
  assert.deepStrictEqual(branchesHolding(root, '.work/sessions/s1/plan.md'), ['main']);
  assert.deepStrictEqual(branchesHolding(root, '.work/sessions/nope/plan.md'), []);

  // A git-ignored .work/ (older gps) is skipped with a warning, never forced in.
  fs.writeFileSync(path.join(root, '.gitignore'), '.work/\n');
  assert.ok(isIgnored(root, '.work/'));
  fs.writeFileSync(path.join(root, '.work', 'sessions', 's1', 'more.md'), 'x\n');
  const skipped = commitWorkDir(root, 'm');
  assert.deepStrictEqual(skipped, { ok: true, sha: null, files: [], skipped: '.work/ is git-ignored' });
  assert.match(describeWorkCommit(skipped).warning, /\.work\/ is git-ignored/);

  // A failed commit (pre-commit hook) is reported with the commands to run.
  fs.writeFileSync(path.join(root, '.gitignore'), '');
  fs.writeFileSync(path.join(root, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\necho "lint failed" >&2\nexit 1\n', { mode: 0o755 });
  const failed = commitWorkDir(root, 'm');
  assert.strictEqual(failed.ok, false);
  assert.strictEqual(failed.reason, 'lint failed');
  assert.match(describeWorkCommit(failed).warning, /not committed \(lint failed\)\. Run by hand: git add -- \.work && git commit/);
}

console.log('git.test.js: all assertions passed');
