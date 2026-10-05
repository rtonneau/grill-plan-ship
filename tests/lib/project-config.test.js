// tests/lib/project-config.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { GpsError } = require('../../skills/gps/scripts/lib/guard');
const { CONFIG_FILENAME, ensureProjectConfig, githubEnabled, rescanProjectConfig, changelogSettings, releaseSettings, saveVersionFiles } = require('../../skills/gps/scripts/lib/project-config');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-projcfg-'));
const marker = path.join(tmp, 'gh-called');
const ghStub = path.join(tmp, 'gh-stub.js');
// The stub records that it ran; GH_STUB_AUTH_FAIL makes `gh auth status` fail.
fs.writeFileSync(ghStub, `
require('fs').appendFileSync(${JSON.stringify(marker)}, 'x');
process.exit(process.env.GH_STUB_AUTH_FAIL ? 1 : 0);
`);
process.env.GPS_GH_BIN = ghStub;

function makeProject(name, origin) {
  const dir = path.join(tmp, name);
  fs.mkdirSync(dir);
  if (origin !== undefined) {
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir, stdio: 'ignore' });
    if (origin) execFileSync('git', ['remote', 'add', 'origin', origin], { cwd: dir, stdio: 'ignore' });
  }
  return dir;
}
const configFile = (dir) => path.join(dir, '.work', CONFIG_FILENAME);
const readFile = (dir) => JSON.parse(fs.readFileSync(configFile(dir), 'utf-8'));

// Not a git repo: off, file created, gh never asked.
const plain = makeProject('plain');
assert.strictEqual(githubEnabled(plain), false);
let config = readFile(plain);
assert.strictEqual(config.version, 1);
assert.strictEqual(config.github.enabled, false);
assert.ok(!Number.isNaN(Date.parse(config.github.detected_at)));
assert.ok(!fs.existsSync(marker), 'gh must not run outside a GitHub repo');

// Repo with a non-GitHub origin: off.
assert.strictEqual(githubEnabled(makeProject('gitlab', 'https://gitlab.com/acme/app.git')), false);
assert.ok(!fs.existsSync(marker));

// GitHub origin + gh authenticated: on.
const hosted = makeProject('hosted', 'https://github.com/acme/app.git');
assert.strictEqual(githubEnabled(hosted), true);
assert.ok(fs.existsSync(marker), 'gh auth status was checked');

// GitHub origin but gh not authenticated: off.
process.env.GH_STUB_AUTH_FAIL = '1';
assert.strictEqual(githubEnabled(makeProject('noauth', 'https://github.com/acme/app.git')), false);
delete process.env.GH_STUB_AUTH_FAIL;

// Detected once: a hand-edited flag is respected and never re-detected.
config = readFile(hosted);
config.github.enabled = false;
fs.writeFileSync(configFile(hosted), JSON.stringify(config));
assert.strictEqual(githubEnabled(hosted), false);
assert.strictEqual(readFile(hosted).github.detected_at, config.github.detected_at);
fs.writeFileSync(configFile(plain), JSON.stringify({ version: 1, github: { enabled: true } }));
assert.strictEqual(githubEnabled(plain), true);

// Invalid files are refused with a hint, never overwritten.
fs.writeFileSync(configFile(plain), '{ not json');
assert.throws(() => ensureProjectConfig(plain), (err) => err instanceof GpsError && /not valid JSON/.test(err.message));
fs.writeFileSync(configFile(plain), JSON.stringify({ version: 1, github: { enabled: 'yes' } }));
assert.throws(() => ensureProjectConfig(plain), (err) => err instanceof GpsError && /github\.enabled/.test(err.message) && Boolean(err.hint));
assert.strictEqual(fs.readFileSync(configFile(plain), 'utf-8'), JSON.stringify({ version: 1, github: { enabled: 'yes' } }));

// Rescan: a project detected off, then pushed to GitHub.
const later = makeProject('later');
assert.strictEqual(githubEnabled(later), false);
const before = readFile(later);
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: later, stdio: 'ignore' });
let result = rescanProjectConfig(later, { check: true });
assert.deepStrictEqual([result.status, result.detected.reason], ['unchanged', 'no "origin" remote']);
execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:acme/app.git'], { cwd: later, stdio: 'ignore' });

// check and plain rescan report the change but write nothing.
result = rescanProjectConfig(later, { check: true });
assert.deepStrictEqual([result.status, result.stored, result.detected.enabled], ['differs', false, true]);
result = rescanProjectConfig(later);
assert.strictEqual(result.status, 'differs');
assert.deepStrictEqual(readFile(later), before);

// apply writes the new value, keeping unknown fields.
fs.writeFileSync(configFile(later), JSON.stringify({ ...before, extra: 1 }));
result = rescanProjectConfig(later, { apply: true });
assert.strictEqual(result.status, 'updated');
assert.strictEqual(readFile(later).github.enabled, true);
assert.strictEqual(readFile(later).extra, 1);
assert.strictEqual(githubEnabled(later), true);

// Same value: rescan refreshes detected_at, check leaves the file alone.
const stamped = { ...readFile(later), github: { enabled: true, detected_at: '2020-01-01T00:00:00.000Z' } };
fs.writeFileSync(configFile(later), JSON.stringify(stamped));
assert.strictEqual(rescanProjectConfig(later, { check: true }).status, 'unchanged');
assert.strictEqual(readFile(later).github.detected_at, '2020-01-01T00:00:00.000Z');
result = rescanProjectConfig(later);
assert.deepStrictEqual([result.status, result.storedAt], ['unchanged', '2020-01-01T00:00:00.000Z']);
assert.notStrictEqual(readFile(later).github.detected_at, '2020-01-01T00:00:00.000Z');

// A hand-forced flag is not overwritten without apply.
process.env.GH_STUB_AUTH_FAIL = '1';
result = rescanProjectConfig(later);
assert.strictEqual(result.status, 'differs');
assert.match(result.detected.reason, /gh is not authenticated/);
assert.strictEqual(readFile(later).github.enabled, true);
delete process.env.GH_STUB_AUTH_FAIL;

// Other reasons; a missing file is created.
assert.match(rescanProjectConfig(makeProject('gitlab2', 'https://gitlab.com/a/b.git')).detected.reason, /not on github\.com/);
const fresh = makeProject('fresh');
result = rescanProjectConfig(fresh, { check: true });
assert.deepStrictEqual([result.status, result.stored, result.detected.reason], ['created', null, 'not a git repository']);
assert.strictEqual(readFile(fresh).github.enabled, false);

// An invalid file is refused, never overwritten by a rescan.
fs.writeFileSync(configFile(fresh), '{ not json');
assert.throws(() => rescanProjectConfig(fresh, { apply: true }), GpsError);
assert.strictEqual(fs.readFileSync(configFile(fresh), 'utf-8'), '{ not json');

// changelog / release settings: defaults on read, never written by a read.
const cfgDir = makeProject('settings');
assert.deepStrictEqual(changelogSettings(cfgDir), { enabled: true, path: 'CHANGELOG.md' });
assert.deepStrictEqual(releaseSettings(cfgDir), { versionFiles: null, githubRelease: 'minor+' });
assert.ok(!fs.existsSync(configFile(cfgDir)));
ensureProjectConfig(cfgDir);
const cfgBefore = fs.readFileSync(configFile(cfgDir), 'utf-8');
assert.deepStrictEqual(releaseSettings(cfgDir), { versionFiles: null, githubRelease: 'minor+' });
assert.strictEqual(fs.readFileSync(configFile(cfgDir), 'utf-8'), cfgBefore);
saveVersionFiles(cfgDir, ['package.json']);
assert.deepStrictEqual(releaseSettings(cfgDir).versionFiles, ['package.json']);
assert.strictEqual(readFile(cfgDir).github.enabled, false);
fs.writeFileSync(configFile(cfgDir), JSON.stringify({ github: { enabled: false }, changelog: { enabled: false, path: 'docs/CL.md' }, release: { githubRelease: 'all' } }));
assert.deepStrictEqual(changelogSettings(cfgDir), { enabled: false, path: 'docs/CL.md' });
assert.deepStrictEqual(releaseSettings(cfgDir), { versionFiles: null, githubRelease: 'all' });
const invalidCases = [
  [{ changelog: { enabled: 'yes' } }, /changelog.enabled/], [{ changelog: { path: 3 } }, /changelog.path/],
  [{ release: { githubRelease: 'sometimes' } }, /githubRelease/],
  // Not an object: a GpsError, never a TypeError.
  [{ changelog: null }, /"changelog" must be an object/], [{ changelog: 'yes' }, /"changelog" must be an object/],
  [{ release: null }, /"release" must be an object/], [{ release: [] }, /"release" must be an object/],
  [{ release: { versionFiles: 'package.json' } }, /release.versionFiles/], [{ release: { versionFiles: [3] } }, /release.versionFiles/],
  // Paths stay inside the project.
  [{ changelog: { path: '../CHANGELOG.md' } }, /changelog.path.*inside the project/],
  [{ changelog: { path: 'docs/../../x.md' } }, /changelog.path.*inside the project/],
  [{ changelog: { path: path.resolve(tmp, 'abs.md') } }, /changelog.path.*inside the project/],
  [{ changelog: { path: '/etc/x.md' } }, /changelog.path.*inside the project/],
  [{ release: { versionFiles: ['package.json', '../other/package.json'] } }, /release.versionFiles.*inside the project/],
  [{ release: { versionFiles: [path.resolve(tmp, 'package.json')] } }, /release.versionFiles.*inside the project/],
];
for (const [bad, re] of invalidCases) {
  fs.writeFileSync(configFile(cfgDir), JSON.stringify({ github: { enabled: false }, ...bad }));
  assert.throws(() => changelogSettings(cfgDir), (e) => e instanceof GpsError && re.test(e.message), JSON.stringify(bad));
}
fs.writeFileSync(configFile(cfgDir), JSON.stringify({ github: { enabled: false }, changelog: { path: 'docs/./CL.md' }, release: { versionFiles: ['sub/package.json'] } }));
assert.strictEqual(changelogSettings(cfgDir).path, 'docs/./CL.md');
assert.deepStrictEqual(releaseSettings(cfgDir).versionFiles, ['sub/package.json']);

delete process.env.GPS_GH_BIN;
fs.rmSync(tmp, { recursive: true, force: true });
console.log('# project-config.test.js: all assertions passed');
