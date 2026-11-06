// tests/lib/version-files.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { GpsError } = require('../../skills/gps/scripts/lib/guard');
const { KNOWN_VERSION_FILES, detectVersionFiles, readVersions, writeVersion, rewriteCargoPins } = require('../../skills/gps/scripts/lib/version-files');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-verfiles-'));
const put = (rel, text) => {
  fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
  fs.writeFileSync(path.join(tmp, rel), text);
};
const get = (rel) => fs.readFileSync(path.join(tmp, rel), 'utf-8');

assert.deepStrictEqual(KNOWN_VERSION_FILES, ['package.json', 'plugin.json', '.codex-plugin/plugin.json', '.claude-plugin/plugin.json',
  '.claude-plugin/marketplace.json', 'pyproject.toml', 'Cargo.toml', 'CMakeLists.txt']);

put('package.json', JSON.stringify({ name: 'x', version: '1.2.3' }, null, 2) + '\n');
put('plugin.json', JSON.stringify({ name: 'x', version: '1.2.3' }, null, 2) + '\n');
put('.codex-plugin/plugin.json', JSON.stringify({ name: 'x', version: '1.2.3' }, null, 2) + '\n');
put('.claude-plugin/plugin.json', JSON.stringify({ name: 'x', version: '1.2.3' }, null, 2) + '\n');
put('.claude-plugin/marketplace.json', JSON.stringify({ name: 'm', plugins: [{ name: 'a', version: '1.2.3' }, { name: 'b', version: '1.2.3' }] }, null, 2) + '\n');
put('CMakeLists.txt', 'cmake_minimum_required(VERSION 3.20)\nproject(Foo VERSION 1.2.3 LANGUAGES CXX)\n');
put('pyproject.toml', '[project]\nname = "x"\n\n[tool.other]\nversion = "9"\n');
fs.rmSync(path.join(tmp, 'pyproject.toml'));

assert.deepStrictEqual(detectVersionFiles(tmp),
  ['package.json', 'plugin.json', '.codex-plugin/plugin.json', '.claude-plugin/plugin.json', '.claude-plugin/marketplace.json', 'CMakeLists.txt']);
assert.deepStrictEqual(readVersions(tmp, ['package.json', '.claude-plugin/marketplace.json', 'CMakeLists.txt']).map((r) => r.version),
  ['1.2.3', '1.2.3', '1.2.3']);

for (const f of ['package.json', 'plugin.json', '.codex-plugin/plugin.json', '.claude-plugin/plugin.json', '.claude-plugin/marketplace.json', 'CMakeLists.txt']) {
  writeVersion(tmp, f, '1.3.0');
}
assert.strictEqual(JSON.parse(get('plugin.json')).version, '1.3.0');
assert.strictEqual(JSON.parse(get('.codex-plugin/plugin.json')).version, '1.3.0');
assert.strictEqual(get('package.json'), JSON.stringify({ name: 'x', version: '1.3.0' }, null, 2) + '\n');
const market = JSON.parse(get('.claude-plugin/marketplace.json'));
assert.deepStrictEqual(market.plugins.map((p) => p.version), ['1.3.0', '1.3.0']);
assert.strictEqual(market.version, undefined);
assert.ok(get('.claude-plugin/marketplace.json').endsWith('}\n'));
assert.strictEqual(get('CMakeLists.txt'), 'cmake_minimum_required(VERSION 3.20)\nproject(Foo VERSION 1.3.0 LANGUAGES CXX)\n');

const originalRename = fs.renameSync;
fs.renameSync = () => { const err = new Error('denied'); err.code = 'EPERM'; throw err; };
try {
  assert.throws(() => writeVersion(tmp, 'plugin.json', '1.4.0'), (err) => err.code === 'EPERM');
} finally {
  fs.renameSync = originalRename;
}
assert.strictEqual(JSON.parse(get('plugin.json')).version, '1.3.0');
assert.strictEqual(fs.readdirSync(tmp).filter((n) => n.includes('.tmp-')).length, 0);

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

// Cargo workspace: [workspace.package] version is read and written, comments kept.
put('Cargo.toml', '[workspace]\r\nmembers = ["a"]\r\n\r\n[workspace.package]\r\nversion = "0.1.0" # shared\r\nedition = "2021"\r\n');
assert.strictEqual(readVersions(tmp, ['Cargo.toml'])[0].version, '0.1.0');
assert.ok(detectVersionFiles(tmp).includes('Cargo.toml'));
writeVersion(tmp, 'Cargo.toml', '0.2.0');
assert.strictEqual(get('Cargo.toml'), '[workspace]\r\nmembers = ["a"]\r\n\r\n[workspace.package]\r\nversion = "0.2.0" # shared\r\nedition = "2021"\r\n');
// [package] with an inherited version stays unreadable even beside [workspace.package].
put('Cargo.toml', '[package]\nname = "x"\nversion = "0.1.0"\n\n[workspace.package]\nauthors = ["a"]\n');
assert.strictEqual(readVersions(tmp, ['Cargo.toml'])[0].version, '0.1.0');

// Pins: path dependencies whose version equals the previous one move; the rest do not.
{
  const warnings = [];
  const warn = (m) => warnings.push(m);
  put('Cargo.toml', [
    '[workspace]',
    'members = [',
    '  "crates/*", # glob',
    '  "single",',
    '  "weird/*/x",',
    ']',
    'exclude = ["crates/skipped"]',
    '',
    '[workspace.package]',
    'version = "1.0.0"',
    '',
    '[workspace.dependencies]',
    'a = { path = "crates/a", version = "1.0.0" }',
    'b = { path = "crates/b", version = "0.9.0" }',
    'reg = { version = "1.0.0" }',
    'single = { version = "1.0.0", path = "single" } # c1',
    'sub = { path = "x", version = "1.0.0", features = ["version = \\"1.0.0\\""] }',
    '',
  ].join('\r\n'));
  const a = '[package]\nname = "a"\nversion.workspace = true\n\n[dependencies]\nb = { path = "../b", version = "1.0.0" }\nreg = "1.0.0"\n\n[build-dependencies.single]\npath = "../../single"\nversion = "1.0.0"\n\n[dependencies.other]\nversion = "1.0.0"\n\n[target.\'cfg(unix)\'.dependencies]\nb = { path = "../b", version = "1.0.0" }\n';
  put('crates/a/Cargo.toml', a);
  put('crates/b/Cargo.toml', '[package]\nname = "b"\nversion.workspace = true\n');
  put('crates/skipped/Cargo.toml', '[dependencies]\na = { path = "../a", version = "1.0.0" }\n');
  put('crates/not-a-crate/readme.txt', 'x');
  put('single/Cargo.toml', '[dependencies]\na = { path = "../crates/a", version = "1.0.0" }\n');
  const changed = rewriteCargoPins(tmp, '1.0.0', '1.1.0', { warn });
  assert.deepStrictEqual(changed.sort(), ['Cargo.toml', 'crates/a/Cargo.toml', 'single/Cargo.toml']);
  const root = get('Cargo.toml');
  assert.ok(root.includes('a = { path = "crates/a", version = "1.1.0" }\r\n'), root);
  assert.ok(root.includes('b = { path = "crates/b", version = "0.9.0" }\r\n'));
  assert.ok(root.includes('reg = { version = "1.0.0" }\r\n'));
  assert.ok(root.includes('single = { version = "1.1.0", path = "single" } # c1\r\n'));
  assert.ok(root.includes('version = "1.0.0"\r\n\r\n[workspace.dependencies]'), 'the workspace version itself is not a pin');
  assert.ok(root.includes('sub = { path = "x", version = "1.1.0", features = ["version = \\"1.0.0\\""] }\r\n'), root);
  assert.strictEqual(get('crates/a/Cargo.toml'), a
    .replace('b = { path = "../b", version = "1.0.0" }\nreg', 'b = { path = "../b", version = "1.1.0" }\nreg')
    .replace('path = "../../single"\nversion = "1.0.0"', 'path = "../../single"\nversion = "1.1.0"')
    .replace('cfg(unix)\'.dependencies]\nb = { path = "../b", version = "1.0.0" }', 'cfg(unix)\'.dependencies]\nb = { path = "../b", version = "1.1.0" }'));
  assert.strictEqual(get('crates/skipped/Cargo.toml'), '[dependencies]\na = { path = "../a", version = "1.0.0" }\n', 'excluded member untouched');
  assert.strictEqual(get('single/Cargo.toml'), '[dependencies]\na = { path = "../crates/a", version = "1.1.0" }\n');
  assert.strictEqual(warnings.length, 1);
  assert.match(warnings[0], /weird\/\*\/x/);
  assert.deepStrictEqual(rewriteCargoPins(tmp, '1.0.0', '1.1.0', { warn }), [], 'nothing left to move');
  assert.throws(() => rewriteCargoPins(tmp, '1.1.0', 'abc'), GpsError);
  // Without [workspace], nothing is touched.
  put('Cargo.toml', '[package]\nname = "x"\nversion = "1.0.0"\n\n[dependencies]\na = { path = "a", version = "1.0.0" }\n');
  assert.deepStrictEqual(rewriteCargoPins(tmp, '1.0.0', '1.1.0'), []);
  assert.ok(get('Cargo.toml').includes('a = { path = "a", version = "1.0.0" }'));
}

// A member outside the project is warned about and never written; "./" and "a/../" forms still resolve inside.
{
  const warnings = [];
  const outer = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-vf-outside-'));
  const inner = path.join(outer, 'project');
  const pin = '[dependencies]\na = { path = "../a", version = "1.0.0" }\n';
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(outer, rel)), { recursive: true });
    fs.writeFileSync(path.join(outer, rel), text);
  };
  write('project/Cargo.toml', '[workspace]\nmembers = ["../shared", "../many/*", "crates/../../shared", "./inside", "crates/../other"]\n\n[workspace.package]\nversion = "1.0.0"\n');
  for (const rel of ['shared', 'many/one', 'project/inside', 'project/other']) write(`${rel}/Cargo.toml`, pin);
  const changed = rewriteCargoPins(inner, '1.0.0', '1.1.0', { warn: (m) => warnings.push(m) });
  assert.deepStrictEqual(changed.sort(), ['inside/Cargo.toml', 'other/Cargo.toml']);
  for (const rel of ['shared', 'many/one']) assert.strictEqual(fs.readFileSync(path.join(outer, rel, 'Cargo.toml'), 'utf-8'), pin, `${rel} untouched`);
  assert.strictEqual(warnings.length, 3);
  for (const w of warnings) assert.match(w, /outside the project/);
  fs.rmSync(outer, { recursive: true, force: true });
}

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
