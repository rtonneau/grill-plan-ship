// tests/lib/scratch-dir.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { BUILD_DIR_NAMES, isBuildTree, dirSize, formatBytes, cleanScratch, ensureScratchDir, ensureGitignoreEntry, gitignoreCovers, removeGitignoreEntry } = require('../../skills/gps/scripts/lib/scratch-dir');

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

// gitignoreCovers / removeGitignoreEntry: slashes aside, every matching line goes, the rest stays.
fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules/\n.work/\n/.work\nbuild/\n');
assert.strictEqual(gitignoreCovers(root, '.work/'), true);
assert.strictEqual(gitignoreCovers(root, '.work/sessions/.current-session'), false);
assert.strictEqual(removeGitignoreEntry(root, '.work/'), true);
assert.strictEqual(fs.readFileSync(path.join(root, '.gitignore'), 'utf-8'), 'node_modules/\nbuild/\n');
assert.strictEqual(removeGitignoreEntry(root, '.work/'), false, 'nothing left to remove');

// isBuildTree: names
for (const name of ['build', 'build-debug', 'build_x', 'node_modules', 'CMakeFiles', '__pycache__', '.venv', 'venv', 'target', 'dist', 'obj', '.gradle', '.cache']) {
  assert.strictEqual(isBuildTree(path.join(root, 'nonexistent'), name), true, name);
}
for (const name of ['builder', 'buildlogs', 'bin', 'out', 'logs']) {
  assert.strictEqual(isBuildTree(path.join(root, 'nonexistent'), name), false, name);
}
assert.ok(BUILD_DIR_NAMES.includes('build'));
assert.strictEqual(isBuildTree(path.join(root, 'nonexistent'), 'custom', ['custom']), true);

// formatBytes
assert.strictEqual(formatBytes(0), '0 B');
assert.strictEqual(formatBytes(512), '512 B');
assert.strictEqual(formatBytes(12.3 * 1024), '12.3 KB');
assert.strictEqual(formatBytes(4.5 * 1024 * 1024), '4.5 MB');

// cleanScratch fixtures
const put = (base, rel, content = 'x') => {
  const file = path.join(base, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};
const makeProject = () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-clean-scratch-'));
  const scratch = path.join(proj, '.scratch', 'tests', 'sess');
  put(scratch, 'result.log', 'evidence');
  put(scratch, 'build/obj.o', '12345');
  put(scratch, 'build/deep/more.o', '123');
  put(scratch, 'a/b/build/x.bin', '12');
  put(scratch, 'a/b/notes.txt', 'keep');
  put(scratch, 'odd/CMakeCache.txt', 'cache');
  put(scratch, 'odd/out.bin', '1234');
  put(scratch, 'custom/data.bin', '123456');
  put(scratch, 'builder/keep.txt', 'k');
  return { proj, scratch };
};

// dirSize
{
  const { proj, scratch } = makeProject();
  assert.strictEqual(dirSize(path.join(scratch, 'build')), 8);
  assert.strictEqual(dirSize(path.join(proj, 'missing')), 0);
  fs.rmSync(proj, { recursive: true, force: true });
}

// policy none: nothing removed
{
  const { proj, scratch } = makeProject();
  const r = cleanScratch(proj, 'sess', { policy: 'none' });
  assert.deepStrictEqual(r, { policy: 'none', removed: [], freedBytes: 0, failures: [] });
  assert.ok(fs.existsSync(path.join(scratch, 'build')));
  fs.rmSync(proj, { recursive: true, force: true });
}

// policy build-artifacts: trees removed whole, evidence kept
{
  const { proj, scratch } = makeProject();
  const r = cleanScratch(proj, 'sess', { policy: 'build-artifacts' });
  assert.strictEqual(r.policy, 'build-artifacts');
  assert.deepStrictEqual(r.removed.sort(), ['.scratch/tests/sess/a/b/build', '.scratch/tests/sess/build', '.scratch/tests/sess/odd'].sort());
  assert.strictEqual(r.freedBytes, 8 + 2 + 5 + 4);
  assert.deepStrictEqual(r.failures, []);
  assert.ok(!fs.existsSync(path.join(scratch, 'build')));
  assert.ok(!fs.existsSync(path.join(scratch, 'a', 'b', 'build')));
  assert.ok(!fs.existsSync(path.join(scratch, 'odd')), 'CMakeCache.txt marks the dir whatever its name');
  for (const kept of ['result.log', 'a/b/notes.txt', 'custom/data.bin', 'builder/keep.txt']) {
    assert.ok(fs.existsSync(path.join(scratch, kept)), kept);
  }
  fs.rmSync(proj, { recursive: true, force: true });
}

// extraDirs
{
  const { proj, scratch } = makeProject();
  const r = cleanScratch(proj, 'sess', { policy: 'build-artifacts', extraDirs: ['custom'] });
  assert.ok(r.removed.includes('.scratch/tests/sess/custom'));
  assert.ok(!fs.existsSync(path.join(scratch, 'custom')));
  assert.ok(fs.existsSync(path.join(scratch, 'result.log')));
  fs.rmSync(proj, { recursive: true, force: true });
}

// policy all: whole session dir goes
{
  const { proj, scratch } = makeProject();
  const r = cleanScratch(proj, 'sess', { policy: 'all' });
  assert.deepStrictEqual(r.removed, ['.scratch/tests/sess']);
  assert.ok(r.freedBytes > 0);
  assert.ok(!fs.existsSync(scratch));
  assert.ok(fs.existsSync(path.join(proj, '.scratch', 'tests')));
  fs.rmSync(proj, { recursive: true, force: true });
}

// missing scratch dir: no-op for every policy
{
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-clean-scratch-'));
  for (const policy of ['none', 'build-artifacts', 'all']) {
    assert.deepStrictEqual(cleanScratch(proj, 'nope', { policy }), { policy, removed: [], freedBytes: 0, failures: [] });
  }
  fs.rmSync(proj, { recursive: true, force: true });
}

// a throwing remover is collected, never thrown; other trees still go
{
  const { proj } = makeProject();
  const rm = (target) => {
    if (target.endsWith(`${path.sep}sess${path.sep}build`)) throw new Error('EBUSY: locked');
    fs.rmSync(target, { recursive: true, force: true });
  };
  const r = cleanScratch(proj, 'sess', { policy: 'build-artifacts', rm });
  assert.strictEqual(r.failures.length, 1);
  assert.strictEqual(r.failures[0].path, '.scratch/tests/sess/build');
  assert.match(r.failures[0].reason, /EBUSY/);
  assert.ok(!r.removed.includes('.scratch/tests/sess/build'));
  assert.ok(r.removed.includes('.scratch/tests/sess/a/b/build'));
  assert.strictEqual(r.freedBytes, 2 + 4 + 5);
  const all = cleanScratch(proj, 'sess', { policy: 'all', rm: () => { throw new Error('denied'); } });
  assert.deepStrictEqual(all.removed, []);
  assert.strictEqual(all.failures.length, 1);
  fs.rmSync(proj, { recursive: true, force: true });
}

fs.rmSync(root, { recursive: true, force: true });
console.log('scratch-dir tests passed');
