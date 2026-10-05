// tests/release.test.js — release.js (/gps release): suggest and cut.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const h = require('./helpers');

const today = (() => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
})();

// Finishes a session through the scripts; `type` is its single commit's type.
function finishSession(root, name, type, bump, reason) {
  h.shipReady(root, name, ['a']);
  h.ok(root, 'ticket-start.js', ['1']);
  h.fillLog(root, '01-a');
  fs.writeFileSync(path.join(root, `${name}.js`), `// ${name}\n`);
  h.ok(root, 'ticket-complete.js', ['1', '--message', `${type}: ${name}`, '--file', `${name}.js`]);
  const prep = h.json(root, 'changelog-prepare.js');
  fs.writeFileSync(prep.payloadPath, `- ${name} done\n`);
  h.ok(root, 'changelog-apply.js', ['--bump', bump, ...(reason ? ['--reason', reason] : [])]);
  const id = h.currentSession(root);
  h.ok(root, 'finish.js');
  // gps's one-time .gitignore setup is the project's to commit.
  if (h.git(root, 'status', '--porcelain')) { h.git(root, 'add', '-A'); h.git(root, 'commit', '-q', '-m', 'chore: setup'); }
  return id;
}

function project(prefix, version = '1.4.2') {
  const root = h.gitProject(prefix);
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'x', version }, null, 2) + '\n');
  h.git(root, 'add', 'package.json');
  h.git(root, 'commit', '-q', '-m', 'add package');
  return root;
}

{
  const root = project('gps-rel-');
  fs.mkdirSync(path.join(root, '.claude-plugin'));
  const sid = (() => {
    const first = finishSession(root, 'first', 'fix', 'minor', 'visible to users');
    finishSession(root, 'second', 'feat', 'minor');
    return first;
  })();
  assert.strictEqual(h.git(root, 'status', '--porcelain'), '', 'tree clean after finishing');
  fs.rmdirSync(path.join(root, '.claude-plugin'));

  const headBefore = h.git(root, 'rev-parse', 'HEAD');
  const sug = h.ok(root, 'release.js');
  assert.match(sug.out, /1\.4\.2 → 1\.5\.0 \(minor: 2 session\(s\)\)/);
  assert.match(sug.out, /visible to users/);
  assert.match(sug.out, /Next: .*release\.js --version 1\.5\.0/);
  const data = h.json(root, 'release.js');
  assert.strictEqual(h.git(root, 'rev-parse', 'HEAD'), headBefore, 'suggest makes no commit');
  assert.deepStrictEqual([data.current, data.suggested, data.level, data.sessions], ['1.4.2', '1.5.0', 'minor', 2]);
  assert.strictEqual(data.raised.length, 1);
  assert.strictEqual(data.raised[0].sessionId, sid);
  assert.deepStrictEqual(data.versionFiles, ['package.json']);
  assert.strictEqual(h.git(root, 'status', '--porcelain'), '', 'suggest leaves a clean tree');

  // Refusals change nothing.
  h.assertFails(h.run(root, 'release.js', ['--version', '1.4.0']), 1, /greater than/);
  h.assertFails(h.run(root, 'release.js', ['--version', 'abc']), 2);
  fs.writeFileSync(path.join(root, 'dirty.txt'), 'x');
  h.assertFails(h.run(root, 'release.js', ['--version', '1.5.0']), 1, /clean|uncommitted/i);
  h.assertFails(h.run(root, 'release.js'), 1);
  fs.unlinkSync(path.join(root, 'dirty.txt'));
  h.git(root, 'switch', '-q', '-c', 'feature');
  h.assertFails(h.run(root, 'release.js', ['--version', '1.5.0']), 1, /main/);
  h.git(root, 'switch', '-q', 'main');
  assert.strictEqual(h.git(root, 'tag'), '');

  h.ok(root, 'release.js', ['--version', '1.5.0']);
  const log = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf-8');
  assert.ok(log.includes(`## 1.5.0 (${today})`));
  assert.ok(!log.includes('<!--'));
  assert.ok(!/## Unreleased/.test(log));
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8')).version, '1.5.0');
  assert.match(h.git(root, 'log', '-1', '--format=%B'), /^chore\(release\): 1\.5\.0\n\nBump: minor/);
  assert.ok(h.git(root, 'tag').split('\n').includes('v1.5.0'));
  assert.strictEqual(h.git(root, 'status', '--porcelain'), '');

  assert.match(h.git(root, 'show', '--name-only', '--format=', 'HEAD'), /\.work\/gps-config\.json/);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(root, '.work', 'gps-config.json'), 'utf-8')).release.versionFiles, ['package.json']);
  const head = h.git(root, 'rev-parse', 'HEAD');
  h.assertFails(h.run(root, 'release.js', ['--version', '1.5.0']), 1);
  assert.strictEqual(h.git(root, 'rev-parse', 'HEAD'), head);
  assert.strictEqual(h.git(root, 'status', '--porcelain'), '');
}

// Level written is the one of the version chosen (current → target), not the markers'.
{
  const root = project('gps-rel2-');
  finishSession(root, 'only', 'feat', 'minor');
  const res = h.ok(root, 'release.js', ['--version', '3.0.0']);
  assert.match(res.out, /1\.4\.2 → 3\.0\.0 \(major\)/);
  assert.match(res.out, /Next: .*release\.js --push/);
  assert.match(h.git(root, 'log', '-1', '--format=%B'), /Bump: major/);
}

// First release with .work/ git-ignored: the config is saved but stays out of the commit.
{
  const root = project('gps-rel13-');
  fs.writeFileSync(path.join(root, '.gitignore'), '.work/\n');
  h.git(root, 'add', '.gitignore');
  h.git(root, 'commit', '-q', '-m', 'ignore .work');
  finishSession(root, 'only', 'feat', 'minor');
  h.ok(root, 'release.js', ['--version', '1.5.0']);
  assert.match(h.git(root, 'log', '-1', '--format=%s'), /^chore\(release\): 1\.5\.0$/);
  assert.doesNotMatch(h.git(root, 'show', '--name-only', '--format=', 'HEAD'), /\.work\//);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(root, '.work', 'gps-config.json'), 'utf-8')).release.versionFiles, ['package.json']);
  assert.ok(h.git(root, 'tag').split('\n').includes('v1.5.0'));
  assert.strictEqual(h.git(root, 'status', '--porcelain'), '');
}

// No version file and no heading: --version is required.
{
  const root = h.gitProject('gps-rel3-');
  finishSession(root, 'only', 'feat', 'minor');
  h.assertFails(h.run(root, 'release.js'), 1, /--version/);
  h.assertFails(h.run(root, 'release.js', ['--version', 'x']), 2);
  h.ok(root, 'release.js', ['--version', '0.1.0']);
  assert.ok(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf-8').includes(`## 0.1.0 (${today})`));
  assert.ok(h.git(root, 'tag').includes('v0.1.0'));
}

// Disagreeing version files: a warning names both.
{
  const root = project('gps-rel4-');
  fs.mkdirSync(path.join(root, '.claude-plugin'));
  fs.writeFileSync(path.join(root, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'x', version: '1.4.1' }, null, 2) + '\n');
  h.git(root, 'add', '.');
  h.git(root, 'commit', '-q', '-m', 'add plugin');
  finishSession(root, 'only', 'fix', 'patch');
  const res = h.ok(root, 'release.js');
  assert.match(res.err, /package\.json.*1\.4\.2[\s\S]*plugin\.json.*1\.4\.1|plugin\.json.*1\.4\.1[\s\S]*package\.json.*1\.4\.2/);
  const data = h.json(root, 'release.js');
  assert.strictEqual(data.mismatches.length, 2);
}

// A hand-edited bump marker with an unknown level: ignored, one warning.
{
  const root = project('gps-rel12-');
  finishSession(root, 'only', 'fix', 'patch');
  const file = path.join(root, 'CHANGELOG.md');
  const odd = ['<!-- gps:bump=huge session=x -->', '<!-- gps:bump=huge session=y -->'];
  fs.writeFileSync(file, fs.readFileSync(file, 'utf-8').replace(/(<!-- gps:bump=patch session=\S+ -->)/, (m) => [m, ...odd].join('\n')));
  h.git(root, 'commit', '-q', '-am', 'hand edit');
  const res = h.ok(root, 'release.js');
  assert.match(res.out, /1\.4\.2 → 1\.4\.3 \(patch: 1 session\(s\)\)/);
  assert.strictEqual(res.err.split('\n').filter((l) => /huge/.test(l)).length, 1, 'warned once');
}

// Nothing to release / changelog disabled.
{
  const root = project('gps-rel5-');
  h.assertFails(h.run(root, 'release.js'), 1);
  finishSession(root, 'only', 'feat', 'minor');
  fs.writeFileSync(path.join(root, '.work', 'gps-config.json'), JSON.stringify({ github: { enabled: false }, changelog: { enabled: false } }));
  h.git(root, 'commit', '-q', '-am', 'config');
  h.assertFails(h.run(root, 'release.js'), 1, /disabled/);
}

// A failed tag resumes: the commit exists, only the tag is recreated.
{
  const root = project('gps-rel6-');
  finishSession(root, 'only', 'feat', 'minor');
  h.ok(root, 'release.js', ['--version', '1.5.0']);
  const head = h.git(root, 'rev-parse', 'HEAD');
  h.git(root, 'tag', '-d', 'v1.5.0');
  const res = h.ok(root, 'release.js', ['--version', '1.5.0']);
  assert.match(res.out, /tagged v1\.5\.0/);
  assert.ok(h.git(root, 'tag').includes('v1.5.0'));
  assert.strictEqual(h.git(root, 'rev-parse', 'HEAD'), head);
  assert.strictEqual(h.git(root, 'status', '--porcelain'), '');
}

// Tag exists while Unreleased still has entries: refused.
{
  const root = project('gps-rel7-');
  finishSession(root, 'only', 'feat', 'minor');
  h.git(root, 'tag', 'v1.5.0');
  const head = h.git(root, 'rev-parse', 'HEAD');
  h.assertFails(h.run(root, 'release.js', ['--version', '1.5.0']), 1, /Tag v1\.5\.0 already exists/);
  assert.strictEqual(h.git(root, 'rev-parse', 'HEAD'), head);
  assert.strictEqual(h.git(root, 'status', '--porcelain'), '');
}

// --push: a local bare origin, no GitHub (github.enabled is false here).
{
  const { execFileSync } = require('child_process');
  const root = project('gps-rel8-');
  const bare = fs.mkdtempSync(path.join(require('os').tmpdir(), 'gps-rel8-origin-'));
  execFileSync('git', ['init', '-q', '--bare', bare], { stdio: 'ignore' });
  h.git(root, 'remote', 'add', 'origin', bare);
  finishSession(root, 'only', 'feat', 'minor');
  h.assertFails(h.run(root, 'release.js', ['--push']), 1, /not a release/i);
  h.assertFails(h.run(root, 'release.js', ['--push', '--version', '1.5.0']), 2);
  const cut = h.ok(root, 'release.js', ['--version', '1.5.0']);
  assert.match(cut.out, /git push --atomic --follow-tags origin main/);
  assert.strictEqual(h.git(root, 'status', '--porcelain'), '');

  const res = h.ok(root, 'release.js', ['--push']);
  const data = JSON.parse(h.ok(root, 'release.js', ['--push', '--json']).out);
  assert.strictEqual(data.version, '1.5.0');
  assert.strictEqual(data.pushed, false, 'the second run does not push again');
  assert.deepStrictEqual(data.release, { skipped: 'github-off' });
  assert.match(res.out, /1\.5\.0/);
  const remote = (...a) => execFileSync('git', ['--git-dir', bare, ...a], { encoding: 'utf-8' }).trim();
  assert.strictEqual(remote('rev-parse', 'refs/heads/main'), h.git(root, 'rev-parse', 'HEAD'));
  assert.ok(remote('tag').split('\n').includes('v1.5.0'));
  assert.strictEqual(h.git(root, 'status', '--porcelain'), '', '--push leaves a clean tree');

  // A push that fails: exit 1 with the command.
  const root2 = project('gps-rel9-');
  h.git(root2, 'remote', 'add', 'origin', path.join(bare, 'missing'));
  finishSession(root2, 'only', 'feat', 'minor');
  h.ok(root2, 'release.js', ['--version', '1.5.0']);
  h.assertFails(h.run(root2, 'release.js', ['--push']), 1, /git push --atomic --follow-tags origin main/);
}

// Partial push: origin is ahead, so the atomic push is rejected; a tag put on
// origin by hand (the old non-atomic outcome) must not make a re-run succeed.
{
  const { execFileSync } = require('child_process');
  const os = require('os');
  const root = project('gps-rel10-');
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-rel10-origin-'));
  execFileSync('git', ['init', '-q', '--bare', bare], { stdio: 'ignore' });
  h.git(root, 'remote', 'add', 'origin', bare);
  h.git(root, 'push', '-q', 'origin', 'main');
  // Another clone pushes a commit.
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-rel10-other-'));
  execFileSync('git', ['clone', '-q', bare, other], { stdio: 'ignore' });
  h.git(other, 'config', 'user.email', 'o@example.com');
  h.git(other, 'config', 'user.name', 'Other');
  fs.writeFileSync(path.join(other, 'other.js'), '// x');
  h.git(other, 'add', '.');
  h.git(other, 'commit', '-q', '-m', 'other');
  h.git(other, 'push', '-q', 'origin', 'main');
  finishSession(root, 'only', 'feat', 'minor');
  h.ok(root, 'release.js', ['--version', '1.5.0']);
  h.assertFails(h.run(root, 'release.js', ['--push']), 1, /Push failed/);
  assert.strictEqual(execFileSync('git', ['--git-dir', bare, 'tag'], { encoding: 'utf-8' }).trim(), '', 'atomic: no tag on origin');
  h.git(root, 'push', '-q', 'origin', 'v1.5.0');
  const again = h.run(root, 'release.js', ['--push']);
  h.assertFails(again, 1, /Push failed/);
  assert.doesNotMatch(again.out, /already on origin/);
}

// --push checks the base branch and the config before pushing anything.
{
  const root = project('gps-rel11-');
  finishSession(root, 'only', 'feat', 'minor');
  h.git(root, 'switch', '-q', '-c', 'feature');
  h.git(root, 'switch', '-q', 'main');
  h.ok(root, 'release.js', ['--version', '1.5.0']);
  h.git(root, 'branch', '-f', 'feature', 'HEAD');
  h.git(root, 'switch', '-q', 'feature');
  h.assertFails(h.run(root, 'release.js', ['--push']), 1, /Releases are cut from main/);
  h.git(root, 'switch', '-q', 'main');
  fs.writeFileSync(path.join(root, '.work', 'gps-config.json'), '{ "github": { "enabled": "yes" } }');
  h.assertFails(h.run(root, 'release.js', ['--push']), 1, /gps-config.json is invalid/);
}

h.done('release.test.js');
