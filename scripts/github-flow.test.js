// scripts/github-flow.test.js
//
// A bounded session in a GitHub-hosted project, through the real handlers:
// start -> write(grill, with **Branch:**) creates the session branch ->
// commit -> finish pushes it and opens a PR (stub gh), and the PR shows up
// in INDEX.md, .session-config.json and /gps status.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const SCRIPTS = __dirname;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-ghflow-'));
const root = path.join(tmp, 'repo');
const bare = path.join(tmp, 'origin.git');
const ghLog = path.join(tmp, 'gh-args.json');
const ghStub = path.join(tmp, 'gh-stub.js');
fs.mkdirSync(root);

fs.writeFileSync(ghStub, `
const fs = require('fs');
const args = process.argv.slice(2);
const body = fs.readFileSync(args[args.indexOf('--body-file') + 1], 'utf-8');
fs.writeFileSync(${JSON.stringify(ghLog)}, JSON.stringify({ args, body }));
console.log('https://github.com/acme/app/pull/12');
`);

function run(script, ...args) {
  const result = spawnSync(process.execPath, [path.join(SCRIPTS, script), ...args], {
    cwd: root,
    encoding: 'utf-8',
    env: { ...process.env, CLAUDE_CODE_SESSION_ID: '', GPS_GH_BIN: ghStub },
  });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

function ok(script, ...args) {
  const res = run(script, ...args);
  assert.strictEqual(res.code, 0, `${script} ${args.join(' ')} failed:\n${res.err}`);
  return res;
}

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

git('init', '-q', '-b', 'main');
git('config', 'user.email', 'e2e@example.com');
git('config', 'user.name', 'E2E');
git('remote', 'add', 'origin', 'https://github.com/acme/app.git');
execFileSync('git', ['init', '-q', '--bare', bare], { stdio: 'ignore' });
git('config', `url.${bare.replace(/\\/g, '/')}.insteadOf`, 'https://github.com/acme/app.git');
fs.writeFileSync(path.join(root, 'app.js'), 'console.log(1);\n');
git('add', 'app.js');
git('commit', '-q', '-m', 'initial');

ok('start-session.js', 'Dark Mode');
const sessionId = fs.readFileSync(path.join(root, '.work', 'sessions', '.current-session'), 'utf-8');
const sessionDir = path.join(root, '.work', 'sessions', sessionId);
const configPath = path.join(sessionDir, '.session-config.json');
assert.strictEqual(git('branch', '--show-current'), 'main', 'start must not create a branch');

// write-target asks for a Branch field.
const target = JSON.parse(ok('write-target.js').out);
assert.ok(target.fields.includes('Branch'));
assert.match(target.branchPattern, /feat\|fix/);
const sections = target.sections.map((h) => `## ${h}\n\n${h === 'Problem Statement' ? 'Users want a dark theme.' : `${h}: approved.`}\n`).join('\n');

// Missing / invalid branch -> payload error, nothing written, still on main.
fs.writeFileSync(target.payloadPath, sections);
let res = run('write-apply.js');
assert.strictEqual(res.code, 1);
assert.match(res.err, /Missing field "\*\*Branch:\*\*"/);
fs.writeFileSync(target.payloadPath, `**Branch:** Dark Mode\n\n${sections}`);
res = run('write-apply.js');
assert.strictEqual(res.code, 1);
assert.match(res.err, /must look like/);
assert.strictEqual(git('branch', '--show-current'), 'main');
assert.ok(fs.existsSync(target.payloadPath), 'payload kept for a retry');

// Valid branch -> created from main, recorded, resume written.
fs.writeFileSync(target.payloadPath, `**Branch:** feat/dark-mode-toggle\n\n${sections}`);
res = ok('write-apply.js');
assert.match(res.out, /Working on branch feat\/dark-mode-toggle \(from main\)/);
assert.strictEqual(git('branch', '--show-current'), 'feat/dark-mode-toggle');
let config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
assert.strictEqual(config.git.branch, 'feat/dark-mode-toggle');
assert.strictEqual(config.git.base_branch, 'main');
assert.strictEqual(config.git.pr_url, null);
assert.doesNotMatch(fs.readFileSync(path.join(sessionDir, '01-grill', 'resume.md'), 'utf-8'), /Branch/);

// Bounded implementation work.
fs.writeFileSync(path.join(root, 'theme.js'), 'module.exports = "dark";\n');
git('add', 'theme.js');
git('commit', '-q', '-m', 'feat: add dark theme');

// Finish refuses on the wrong branch, changing nothing.
git('switch', '-q', 'main');
const indexBefore = fs.readFileSync(path.join(sessionDir, 'INDEX.md'), 'utf-8');
const configBefore = fs.readFileSync(configPath, 'utf-8');
res = run('finish.js');
assert.strictEqual(res.code, 1);
assert.match(res.err, /on branch feat\/dark-mode-toggle, but main is checked out/);
assert.strictEqual(fs.readFileSync(path.join(sessionDir, 'INDEX.md'), 'utf-8'), indexBefore);
assert.strictEqual(fs.readFileSync(configPath, 'utf-8'), configBefore);
git('switch', '-q', 'feat/dark-mode-toggle');

// Finish pushes and opens the PR.
res = ok('finish.js');
assert.match(res.out, /Pull request: https:\/\/github\.com\/acme\/app\/pull\/12/);
const call = JSON.parse(fs.readFileSync(ghLog, 'utf-8'));
assert.deepStrictEqual(call.args.slice(0, 8),
  ['pr', 'create', '--base', 'main', '--head', 'feat/dark-mode-toggle', '--title', 'feat: Dark Mode']);
assert.match(call.body, /Users want a dark theme\./);
assert.match(call.body, /feat: add dark theme/);
assert.match(call.body, /Bounded session/);
assert.match(call.body, /Generated with \[Claude Code\]/);
assert.ok(execFileSync('git', ['--git-dir', bare, 'rev-parse', 'refs/heads/feat/dark-mode-toggle'], { encoding: 'utf-8' }).trim());

const index = fs.readFileSync(path.join(sessionDir, 'INDEX.md'), 'utf-8');
assert.match(index, /## Branch & PR/);
assert.match(index, /\*\*Branch:\*\* `feat\/dark-mode-toggle`/);
assert.match(index, /\*\*Pull request:\*\* https:\/\/github\.com\/acme\/app\/pull\/12/);
config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
assert.strictEqual(config.git.pr_url, 'https://github.com/acme/app/pull/12');

const status = JSON.parse(ok('status.js').out);
const summary = status.sessions.find((s) => s.sessionId === sessionId);
assert.strictEqual(summary.branch, 'feat/dark-mode-toggle');
assert.strictEqual(summary.prUrl, 'https://github.com/acme/app/pull/12');

fs.rmSync(tmp, { recursive: true, force: true });
console.log('# github-flow.test.js: all assertions passed');
