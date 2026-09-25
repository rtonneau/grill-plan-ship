// scripts/lib/project-config.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { GpsError } = require('./guard');
const { CONFIG_FILENAME, ensureProjectConfig, githubEnabled } = require('./project-config');

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

delete process.env.GPS_GH_BIN;
fs.rmSync(tmp, { recursive: true, force: true });
console.log('# project-config.test.js: all assertions passed');
