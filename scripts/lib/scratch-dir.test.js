// scripts/lib/scratch-dir.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ensureScratchDir, ensureGitignoreEntry } = require('./scratch-dir');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-scratch-dir-'));

// ensureScratchDir creates the dir, returns a forward-slash relative path
const rel = ensureScratchDir(root, '2026-09-21__foo');
assert.strictEqual(rel, '.scratch/tests/2026-09-21__foo');
assert.ok(fs.statSync(path.join(root, '.scratch', 'tests', '2026-09-21__foo')).isDirectory());

// idempotent, and leaves existing content alone
fs.writeFileSync(path.join(root, rel, 'keep.log'), 'x');
assert.strictEqual(ensureScratchDir(root, '2026-09-21__foo'), rel);
assert.ok(fs.existsSync(path.join(root, rel, 'keep.log')));

// ensureGitignoreEntry: no .gitignore -> created
assert.strictEqual(ensureGitignoreEntry(root), true);
assert.strictEqual(fs.readFileSync(path.join(root, '.gitignore'), 'utf-8'), '.scratch/\n');

// already present -> unchanged
assert.strictEqual(ensureGitignoreEntry(root), false);
assert.strictEqual(fs.readFileSync(path.join(root, '.gitignore'), 'utf-8'), '.scratch/\n');

// existing file without trailing newline -> newline added, entry appended
fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules/');
assert.strictEqual(ensureGitignoreEntry(root), true);
assert.strictEqual(fs.readFileSync(path.join(root, '.gitignore'), 'utf-8'), 'node_modules/\n.scratch/\n');

// CRLF file with entry already present (with or without leading slash) -> unchanged
fs.writeFileSync(path.join(root, '.gitignore'), 'build/\r\n/.scratch\r\n');
assert.strictEqual(ensureGitignoreEntry(root), false);
fs.writeFileSync(path.join(root, '.gitignore'), '.scratch\n');
assert.strictEqual(ensureGitignoreEntry(root), false);

fs.rmSync(root, { recursive: true, force: true });
console.log('scratch-dir tests passed');
