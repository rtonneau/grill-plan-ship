// scripts/lib/git.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { readRecentCommits, readGitStatusSummary } = require('./git');

const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-git-'));
const sessionDir = path.join(projectRoot, '.work', 'sessions', '2026-09-22__test-feature');
fs.mkdirSync(sessionDir, { recursive: true });

// Not a git repo yet -> both helpers degrade to empty arrays, never throw.
assert.deepStrictEqual(readRecentCommits(projectRoot, sessionDir), []);
assert.deepStrictEqual(readGitStatusSummary(projectRoot, sessionDir), []);

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
const log = readRecentCommits(projectRoot, sessionDir);
assert.strictEqual(log.length, 1);
assert.ok(log[0].includes('add notes'));

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

fs.rmSync(projectRoot, { recursive: true, force: true });
console.log('git.test.js: all assertions passed');
