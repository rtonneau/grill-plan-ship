// tests/lib/guard.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  GpsError, localDate, isSlug, slugify, readJson, replaceFile, writeJsonAtomic, MAX_SLUG_LENGTH,
} = require('../../skills/gps/scripts/lib/guard');

const now = new Date(2026, 8, 22, 23, 5, 9); // local time, late evening

// localDate uses local time, not UTC
assert.strictEqual(localDate(now), '2026-09-22');

// slugify: cleaning
assert.strictEqual(slugify('add-dark-mode'), 'add-dark-mode');
assert.strictEqual(slugify('Add Dark Mode!'), 'add-dark-mode');
assert.strictEqual(slugify('Université de Namur'), 'universite-de-namur');
assert.strictEqual(slugify('v1.2_fix'), 'v1.2_fix');
assert.strictEqual(slugify('a..b'), 'a.b');
assert.strictEqual(slugify('a._-b'), 'a-b');

// slugify: path traversal and Windows-illegal characters cannot survive
assert.strictEqual(slugify('x/../../../../escaped'), 'x-escaped');
assert.strictEqual(slugify('../x'), 'x');
assert.strictEqual(slugify('a/b'), 'a-b');
assert.strictEqual(slugify('a:b?c'), 'a-b-c');
assert.strictEqual(slugify('..', now), 'untitled-230509');
assert.strictEqual(slugify('.hidden'), 'hidden');
assert.strictEqual(slugify('$(touch pwned)'), 'touch-pwned');

// slugify: empty -> untitled-<HHMMSS>
assert.strictEqual(slugify('', now), 'untitled-230509');
assert.strictEqual(slugify('   ', now), 'untitled-230509');
assert.strictEqual(slugify('!!!', now), 'untitled-230509');

// slugify: long names are cut at a separator and stay valid
const long = slugify('word '.repeat(40));
assert.ok(long.length <= MAX_SLUG_LENGTH, `too long: ${long.length}`);
assert.ok(isSlug(long));
assert.ok(!long.endsWith('-'));
const noSep = slugify('a'.repeat(100));
assert.strictEqual(noSep.length, MAX_SLUG_LENGTH);

// every slugify output is a valid slug
for (const input of ['', '..', '-a-', 'A B', 'é', '__x__', 'a.-.b', '1', 'x'.repeat(70)]) {
  assert.ok(isSlug(slugify(input, now)), `slugify(${JSON.stringify(input)}) invalid`);
}

// isSlug
assert.ok(isSlug('a-b.c_d'));
assert.ok(!isSlug('..'));
assert.ok(!isSlug('a/b'));
assert.ok(!isSlug('A'));
assert.ok(!isSlug('[slug]'));
assert.ok(!isSlug(''));

// readJson / writeJsonAtomic
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-guard-'));
const file = path.join(dir, 'x.json');
writeJsonAtomic(file, { a: 1 });
assert.deepStrictEqual(readJson(file), { a: 1 });
writeJsonAtomic(file, { a: 2 });
assert.deepStrictEqual(readJson(file), { a: 2 });
assert.deepStrictEqual(fs.readdirSync(dir), ['x.json']); // no temp file left behind

// replaceFile falls back to a direct write when a Windows sandbox denies
// replacement-by-rename, without leaving its sibling temp file behind.
for (const code of ['EPERM', 'EACCES']) {
  const existing = path.join(dir, `existing-${code}.txt`);
  fs.writeFileSync(existing, 'old');
  const deniedRename = { ...fs, renameSync() { const err = new Error(code); err.code = code; throw err; } };
  replaceFile(existing, `new-${code}`, deniedRename);
  assert.strictEqual(fs.readFileSync(existing, 'utf-8'), `new-${code}`);

  const missing = path.join(dir, `missing-${code}.txt`);
  replaceFile(missing, `created-${code}`, deniedRename);
  assert.strictEqual(fs.readFileSync(missing, 'utf-8'), `created-${code}`);
  assert.ok(!fs.readdirSync(dir).some((name) => name.includes('.tmp-')));
}

// Unexpected rename failures propagate, preserve the destination, and clean up.
const unchanged = path.join(dir, 'unchanged.txt');
fs.writeFileSync(unchanged, 'before');
const ioFailure = { ...fs, renameSync() { const err = new Error('disk failure'); err.code = 'EIO'; throw err; } };
assert.throws(() => replaceFile(unchanged, 'after', ioFailure), (err) => err.code === 'EIO');
assert.strictEqual(fs.readFileSync(unchanged, 'utf-8'), 'before');
assert.ok(!fs.readdirSync(dir).some((name) => name.includes('.tmp-')));

fs.writeFileSync(file, '{bad');
assert.throws(() => readJson(file, 'config'), (err) => err instanceof GpsError && /config is not valid JSON/.test(err.message));
assert.throws(() => readJson(path.join(dir, 'missing.json')), GpsError);

console.log('guard.test.js: all assertions passed');
