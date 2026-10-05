// tests/config.test.js — config.js (/gps config [--rescan [--apply]])
// Detection itself (origin, gh auth) is covered in tests/lib/project-config.test.js.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const h = require('./helpers');

const root = h.tempProject();
const file = path.join(root, '.work', 'gps-config.json');
const stored = () => JSON.parse(fs.readFileSync(file, 'utf-8'));

h.assertFails(h.run(root, 'config.js', ['--apply']), 2, /--apply only goes with --rescan/);
h.assertFails(h.run(root, 'config.js', ['extra']), 2);
assert.ok(!fs.existsSync(file), 'usage errors create nothing');

// First run creates the file (not a git repo -> GitHub off).
let res = h.ok(root, 'config.js');
assert.match(res.out, /✅ Created .*gps-config\.json: github\.enabled = false/);
assert.match(res.out, /GitHub detected now: off \(not a git repository\)/);
assert.strictEqual(stored().github.enabled, false);

// Bare config is read-only.
const before = fs.readFileSync(file, 'utf-8');
assert.match(h.ok(root, 'config.js').out, /✅ Stored value matches detection\./);
assert.strictEqual(fs.readFileSync(file, 'utf-8'), before);

// A hand-forced true (e.g. GitHub Enterprise) differs from detection.
fs.writeFileSync(file, JSON.stringify({ version: 1, github: { enabled: true, detected_at: '2026-01-01T00:00:00.000Z' } }));
res = h.ok(root, 'config.js', ['--rescan']);
assert.match(res.out, /⚠️ {2}Stored value differs: github\.enabled true → false\. Nothing was changed\./);
assert.match(res.out, /Applying turns GitHub off/);
assert.match(res.out, /Next: confirm with the user, then run config\.js --rescan --apply\./);
assert.strictEqual(stored().github.enabled, true, '--rescan alone never changes a differing value');
const data = h.json(root, 'config.js', ['--rescan']);
assert.strictEqual(data.status, 'differs');
assert.deepStrictEqual(data.detected, { enabled: false, reason: 'not a git repository' });

res = h.ok(root, 'config.js', ['--rescan', '--apply']);
assert.match(res.out, /✅ Updated: github\.enabled true → false\./);
assert.strictEqual(stored().github.enabled, false);
assert.match(h.ok(root, 'config.js', ['--rescan']).out, /✅ Unchanged; detected_at refreshed\./);

// Changelog and release settings are shown read-only, with their defaults.
res = h.ok(root, 'config.js');
assert.match(res.out, /changelog\.enabled = true/);
assert.match(res.out, /release\.versionFiles = not saved yet/);
assert.match(res.out, /release\.githubRelease = minor\+/);
fs.writeFileSync(file, JSON.stringify({ version: 1, github: { enabled: false, detected_at: '2026-01-01T00:00:00.000Z' },
  changelog: { enabled: false }, release: { versionFiles: ['package.json', 'x.json'], githubRelease: 'none' } }));
res = h.ok(root, 'config.js');
assert.match(res.out, /changelog\.enabled = false/);
assert.match(res.out, /release\.versionFiles = package\.json, x\.json/);
assert.match(res.out, /release\.githubRelease = none/);
assert.strictEqual(h.json(root, 'config.js').release.githubRelease, 'none');

// A corrupt file is an error, not silently replaced.
fs.writeFileSync(file, '{"github": {}}');
h.assertFails(h.run(root, 'config.js'), 1, /"github\.enabled" must be true or false/);

h.done('config.test.js');
