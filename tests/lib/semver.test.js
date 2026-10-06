// tests/lib/semver.test.js
const assert = require('assert');
const {
  LEVELS, parseVersion, formatVersion, compareVersions, bumpVersion, maxLevel, levelRank, bumpFloor, levelBetween,
} = require('../../skills/gps/scripts/lib/semver');

const p = parseVersion;

// parseVersion
assert.deepStrictEqual(p('v2.5.1'), { major: 2, minor: 5, patch: 1 });
assert.deepStrictEqual(p('2.5.1'), { major: 2, minor: 5, patch: 1 });
assert.strictEqual(p('2.5'), null);
assert.strictEqual(p('2.5.1-rc.1'), null);
assert.strictEqual(p('2.5.1+build'), null);

// formatVersion
assert.strictEqual(formatVersion(p('v2.5.1')), '2.5.1');

// bumpVersion
assert.strictEqual(formatVersion(bumpVersion(p('2.5.1'), 'minor')), '2.6.0');
assert.strictEqual(formatVersion(bumpVersion(p('2.5.1'), 'major')), '3.0.0');
assert.strictEqual(formatVersion(bumpVersion(p('2.5.1'), 'patch')), '2.5.2');
assert.strictEqual(formatVersion(bumpVersion(p('0.4.2'), 'major')), '0.5.0');

// compareVersions
assert.strictEqual(compareVersions(p('2.10.0'), p('2.9.9')), 1);
assert.strictEqual(compareVersions(p('2.9.9'), p('2.10.0')), -1);
assert.strictEqual(compareVersions(p('1.2.3'), p('1.2.3')), 0);

// levels
assert.deepStrictEqual(LEVELS, ['patch', 'minor', 'major']);
assert.strictEqual(levelRank('patch'), 0);
assert.strictEqual(levelRank('major'), 2);
assert.strictEqual(maxLevel(['patch', 'major', 'minor']), 'major');
assert.strictEqual(maxLevel([]), null);

// levelBetween: the highest component that changed.
assert.strictEqual(levelBetween(p('1.4.2'), p('3.0.0')), 'major');
assert.strictEqual(levelBetween(p('1.4.2'), p('1.5.0')), 'minor');
assert.strictEqual(levelBetween(p('1.4.2'), p('1.5.7')), 'minor');
assert.strictEqual(levelBetween(p('1.4.2'), p('1.4.9')), 'patch');
assert.strictEqual(levelBetween(p('0.4.2'), p('0.5.0')), 'minor');

// bumpFloor
assert.strictEqual(bumpFloor(['fix: a', 'chore: b']), 'patch');
assert.strictEqual(bumpFloor(['feat(ui): x']), 'minor');
assert.strictEqual(bumpFloor(['feat!: drop y']), 'major');
assert.strictEqual(bumpFloor(['refactor(core)!: z']), 'major');
assert.strictEqual(bumpFloor(['fix: a\n\nBREAKING CHANGE: removed b']), 'major');
assert.strictEqual(bumpFloor(['fix: a\n\nBREAKING-CHANGE: removed b']), 'major');
assert.strictEqual(bumpFloor(['docs: mention feat: in text']), 'patch');
assert.strictEqual(bumpFloor([]), 'patch');

console.log('semver.test.js: all assertions passed');
