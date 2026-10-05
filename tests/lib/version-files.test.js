// tests/lib/version-files.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { GpsError } = require('../../skills/gps/scripts/lib/guard');
const { KNOWN_VERSION_FILES, detectVersionFiles, readVersions, writeVersion } = require('../../skills/gps/scripts/lib/version-files');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-verfiles-'));
const put = (rel, text) => {
  fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
  fs.writeFileSync(path.join(tmp, rel), text);
};
const get = (rel) => fs.readFileSync(path.join(tmp, rel), 'utf-8');

assert.deepStrictEqual(KNOWN_VERSION_FILES, ['package.json', '.claude-plugin/plugin.json',
  '.claude-plugin/marketplace.json', 'pyproject.toml', 'Cargo.toml', 'CMakeLists.txt']);

put('package.json', JSON.stringify({ name: 'x', version: '1.2.3' }, null, 2) + '\n');
put('.claude-plugin/plugin.json', JSON.stringify({ name: 'x', version: '1.2.3' }, null, 2) + '\n');
put('.claude-plugin/marketplace.json', JSON.stringify({ name: 'm', plugins: [{ name: 'a', version: '1.2.3' }, { name: 'b', version: '1.2.3' }] }, null, 2) + '\n');
put('CMakeLists.txt', 'cmake_minimum_required(VERSION 3.20)\nproject(Foo VERSION 1.2.3 LANGUAGES CXX)\n');
put('pyproject.toml', '[project]\nname = "x"\n\n[tool.other]\nversion = "9"\n');
fs.rmSync(path.join(tmp, 'pyproject.toml'));

assert.deepStrictEqual(detectVersionFiles(tmp),
  ['package.json', '.claude-plugin/plugin.json', '.claude-plugin/marketplace.json', 'CMakeLists.txt']);
assert.deepStrictEqual(readVersions(tmp, ['package.json', '.claude-plugin/marketplace.json', 'CMakeLists.txt']).map((r) => r.version),
  ['1.2.3', '1.2.3', '1.2.3']);

for (const f of ['package.json', '.claude-plugin/plugin.json', '.claude-plugin/marketplace.json', 'CMakeLists.txt']) {
  writeVersion(tmp, f, '1.3.0');
}
assert.strictEqual(get('package.json'), JSON.stringify({ name: 'x', version: '1.3.0' }, null, 2) + '\n');
const market = JSON.parse(get('.claude-plugin/marketplace.json'));
assert.deepStrictEqual(market.plugins.map((p) => p.version), ['1.3.0', '1.3.0']);
assert.strictEqual(market.version, undefined);
assert.ok(get('.claude-plugin/marketplace.json').endsWith('}\n'));
assert.strictEqual(get('CMakeLists.txt'), 'cmake_minimum_required(VERSION 3.20)\nproject(Foo VERSION 1.3.0 LANGUAGES CXX)\n');

// pyproject: only the project table; a dependency version elsewhere is untouched.
put('pyproject.toml', '[tool.other]\nversion = "9"\n\n[project]\nname = "x"\nversion = "0.1.0"\n\n[tool.x]\nversion = "7"\n');
assert.strictEqual(readVersions(tmp, ['pyproject.toml'])[0].version, '0.1.0');
writeVersion(tmp, 'pyproject.toml', '0.2.0');
assert.strictEqual(get('pyproject.toml'), '[tool.other]\nversion = "9"\n\n[project]\nname = "x"\nversion = "0.2.0"\n\n[tool.x]\nversion = "7"\n');
put('pyproject.toml', '[tool.poetry]\nversion = "0.1.0"\n');
writeVersion(tmp, 'pyproject.toml', '0.2.0');
assert.strictEqual(get('pyproject.toml'), '[tool.poetry]\nversion = "0.2.0"\n');

// Cargo: [package] only, CRLF kept.
put('Cargo.toml', '[dependencies]\nfoo = { version = "1" }\n\n[package]\r\nname = "x"\r\nversion = "0.1.0"\r\n');
writeVersion(tmp, 'Cargo.toml', '0.2.0');
assert.strictEqual(get('Cargo.toml'), '[dependencies]\nfoo = { version = "1" }\n\n[package]\r\nname = "x"\r\nversion = "0.2.0"\r\n');

// No readable version: null, not detected, and writing throws.
put('Cargo.toml', '[package]\nname = "x"\nversion.workspace = true\n');
assert.strictEqual(readVersions(tmp, ['Cargo.toml'])[0].version, null);
assert.ok(!detectVersionFiles(tmp).includes('Cargo.toml'));
assert.throws(() => writeVersion(tmp, 'Cargo.toml', '1.0.0'), GpsError);
assert.strictEqual(get('Cargo.toml'), '[package]\nname = "x"\nversion.workspace = true\n');
put('package.json', '{ "name": "x" }\n');
assert.throws(() => writeVersion(tmp, 'package.json', '1.0.0'), /version/);
assert.strictEqual(readVersions(tmp, ['package.json', 'missing.json'])[1].version, null);
assert.throws(() => writeVersion(tmp, 'missing.json', '1.0.0'), GpsError);
assert.throws(() => writeVersion(tmp, 'package.json', 'abc'), GpsError);

fs.rmSync(tmp, { recursive: true, force: true });
console.log('# version-files.test.js: all assertions passed');
