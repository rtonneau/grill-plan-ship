// scripts/lib/seeds-store.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { mergeSeeds, getSeed, removeSeed } = require('./seeds-store');

const sessionsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-seeds-store-'));

// No seeds file yet -> getSeed returns null
assert.strictEqual(getSeed(sessionsDir, 'runconfig-resolver'), null);

// mergeSeeds creates the file and stores entries
mergeSeeds(sessionsDir, {
  'runconfig-resolver': { strength: 'Strong', problem: 'p1', solution: 's1' },
  'threads-arg-validation': { strength: 'Strong', problem: 'p2', solution: 's2' },
});
assert.deepStrictEqual(getSeed(sessionsDir, 'runconfig-resolver'), {
  strength: 'Strong',
  problem: 'p1',
  solution: 's1',
});
assert.deepStrictEqual(getSeed(sessionsDir, 'threads-arg-validation'), {
  strength: 'Strong',
  problem: 'p2',
  solution: 's2',
});

// mergeSeeds again with an overlapping slug overwrites only that slug
mergeSeeds(sessionsDir, {
  'runconfig-resolver': { strength: 'Worth exploring', problem: 'p1-revised', solution: 's1-revised' },
});
assert.deepStrictEqual(getSeed(sessionsDir, 'runconfig-resolver'), {
  strength: 'Worth exploring',
  problem: 'p1-revised',
  solution: 's1-revised',
});
// Untouched slug from the earlier merge is still there
assert.deepStrictEqual(getSeed(sessionsDir, 'threads-arg-validation'), {
  strength: 'Strong',
  problem: 'p2',
  solution: 's2',
});

// removeSeed deletes an existing entry and returns true
assert.strictEqual(removeSeed(sessionsDir, 'runconfig-resolver'), true);
assert.strictEqual(getSeed(sessionsDir, 'runconfig-resolver'), null);
// The other entry survives the removal
assert.notStrictEqual(getSeed(sessionsDir, 'threads-arg-validation'), null);

// removeSeed on a slug that isn't present returns false, file untouched
const beforeRaw = fs.readFileSync(path.join(sessionsDir, '.pending-seeds.json'), 'utf-8');
assert.strictEqual(removeSeed(sessionsDir, 'does-not-exist'), false);
const afterRaw = fs.readFileSync(path.join(sessionsDir, '.pending-seeds.json'), 'utf-8');
assert.strictEqual(beforeRaw, afterRaw);

// A corrupted .pending-seeds.json degrades to "no seeds found" instead
// of throwing, and is moved aside (never overwritten or deleted).
const corruptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-seeds-store-corrupt-'));
const corruptRaw = '{ this is not valid json';
fs.writeFileSync(path.join(corruptDir, '.pending-seeds.json'), corruptRaw);
assert.strictEqual(getSeed(corruptDir, 'runconfig-resolver'), null);
const moved = fs.readdirSync(corruptDir).filter((f) => f.startsWith('.pending-seeds.json.corrupt-'));
assert.strictEqual(moved.length, 1);
assert.strictEqual(fs.readFileSync(path.join(corruptDir, moved[0]), 'utf-8'), corruptRaw);
assert.strictEqual(removeSeed(corruptDir, 'runconfig-resolver'), false);

// Merging after corruption starts fresh and leaves the quarantined copy alone
mergeSeeds(corruptDir, { fresh: { strength: 'Strong', problem: 'p', solution: 's' } });
assert.notStrictEqual(getSeed(corruptDir, 'fresh'), null);
assert.strictEqual(fs.readFileSync(path.join(corruptDir, moved[0]), 'utf-8'), corruptRaw);

// Valid JSON that isn't an object is quarantined too
fs.writeFileSync(path.join(corruptDir, '.pending-seeds.json'), '[1,2]');
assert.strictEqual(getSeed(corruptDir, 'fresh'), null);
assert.strictEqual(fs.readdirSync(corruptDir).filter((f) => f.includes('.corrupt-')).length, 2);
fs.rmSync(corruptDir, { recursive: true, force: true });

fs.rmSync(sessionsDir, { recursive: true, force: true });
console.log('seeds-store.test.js: all assertions passed');
