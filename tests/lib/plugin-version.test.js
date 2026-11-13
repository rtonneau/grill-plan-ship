// tests/lib/plugin-version.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SCHEMA_VERSION, PLUGIN_MANIFEST, gpsVersion, contractHeader } = require('../../skills/gps/scripts/lib/plugin-version');

const repoRoot = path.join(__dirname, '..', '..');
assert.strictEqual(SCHEMA_VERSION, 2);
// The manifest two levels above the skill: the checkout's own plugin.json.
assert.strictEqual(PLUGIN_MANIFEST, path.join(repoRoot, 'plugin.json'));
assert.strictEqual(gpsVersion(), require('../../package.json').version);
assert.deepStrictEqual(contractHeader(), { schemaVersion: 2, gpsVersion: gpsVersion() });

// Missing, unreadable or version-less manifests give null.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-plugin-version-'));
assert.strictEqual(gpsVersion(path.join(dir, 'missing.json')), null);
fs.writeFileSync(path.join(dir, 'bad.json'), '{ not json');
assert.strictEqual(gpsVersion(path.join(dir, 'bad.json')), null);
fs.writeFileSync(path.join(dir, 'none.json'), JSON.stringify({ name: 'gps', version: 3 }));
assert.strictEqual(gpsVersion(path.join(dir, 'none.json')), null);
fs.rmSync(dir, { recursive: true, force: true });

console.log('plugin-version.test.js: all assertions passed');
