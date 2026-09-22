// scripts/lib/git.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { readRecentCommits, readGitStatusSummary, readGitStatus } = require('./git');

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

// readGitStatus shows both views separately.
const both = readGitStatus(projectRoot, sessionDir);
assert.strictEqual(both.session.length, 1);
assert.strictEqual(both.project.length, 2);
assert.ok(both.project.some((e) => e.path.endsWith('unrelated.txt')));

fs.rmSync(projectRoot, { recursive: true, force: true });
console.log('git.test.js: all assertions passed');
