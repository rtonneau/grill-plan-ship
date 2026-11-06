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
  // Setup changes belong to the project, not finish's session-record commit.
  if (h.git(root, 'status', '--porcelain', '--', '.gitignore')) {
    h.git(root, 'add', '--', '.gitignore');
    h.git(root, 'commit', '-q', '-m', 'chore: setup ignores');
  }
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

// A project holding one finished session named "only", the common start of
// the cases below; each gets its own copy.
function finished(prefix, type, bump) {
  return h.copyFixture(`finished-${type}-${bump}`, prefix, () => {
    const root = project('gps-rel-fixture-');
    return { root, id: finishSession(root, 'only', type, bump) };
  });
}

// The same with .work/ git-ignored.
function finishedWorkIgnored(prefix) {
  return h.copyFixture('finished-work-ignored', prefix, () => {
    const root = project('gps-rel-fixture-');
    fs.writeFileSync(path.join(root, '.gitignore'), '.work/\n');
    h.git(root, 'add', '.gitignore');
    h.git(root, 'commit', '-q', '-m', 'ignore .work');
    return { root, id: finishSession(root, 'only', 'feat', 'minor') };
  });
}

{
  const root = project('gps-rel-');
  fs.writeFileSync(path.join(root, 'plugin.json'), JSON.stringify({ name: 'x', version: '1.4.2' }) + '\n');
  h.git(root, 'add', 'plugin.json');
  h.git(root, 'commit', '-q', '-m', 'add portable manifest');
  fs.mkdirSync(path.join(root, '.claude-plugin'));
  const sid = (() => {
    const first = finishSession(root, 'first', 'fix', 'minor', 'visible to users');
    finishSession(root, 'second', 'fix', 'patch');
    return first;
  })();
  assert.strictEqual(h.git(root, 'status', '--porcelain'), '', 'tree clean after finishing');
  fs.rmdirSync(path.join(root, '.claude-plugin'));
  assert.ok(!fs.existsSync(path.join(root, 'CHANGELOG.md')), 'finish never writes CHANGELOG.md');
  const fragments = fs.readdirSync(path.join(root, '.work', 'changelog')).sort();
  assert.deepStrictEqual(fragments.map((n) => n.replace(/^\d{4}-\d{2}-\d{2}__/, '')), ['first.md', 'second.md']);
  // A hand-written Unreleased bullet goes first in the release.
  fs.writeFileSync(path.join(root, 'CHANGELOG.md'), '# Changelog\n\n## Unreleased\n\n- hand note\n');
  h.git(root, 'add', 'CHANGELOG.md');
  h.git(root, 'commit', '-q', '-m', 'docs: hand note');

  const headBefore = h.git(root, 'rev-parse', 'HEAD');
  const sug = h.ok(root, 'release.js');
  assert.match(sug.out, /1\.4\.2 → 1\.5\.0 \(minor: 2 session\(s\)\)/);
  assert.match(sug.out, new RegExp(`raised by Claude \\(${sid}\\): visible to users`));
  assert.strictEqual(sug.out.split('\n').filter((l) => /raised by Claude/.test(l)).length, 1);
  assert.match(sug.out, /Next: .*release\.js --version 1\.5\.0/);
  const data = h.json(root, 'release.js');
  assert.strictEqual(h.git(root, 'rev-parse', 'HEAD'), headBefore, 'suggest makes no commit');
  assert.deepStrictEqual([data.current, data.suggested, data.level, data.sessions], ['1.4.2', '1.5.0', 'minor', 2]);
  assert.deepStrictEqual(data.alternatives, { patch: '1.4.3', minor: '1.5.0', major: '2.0.0' });
  assert.match(sug.out, /Candidates: patch 1\.4\.3, minor 1\.5\.0, major 2\.0\.0/);
  assert.strictEqual(data.raised.length, 1);
  assert.strictEqual(data.raised[0].sessionId, sid);
  assert.deepStrictEqual(data.versionFiles, ['package.json', 'plugin.json']);
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
  assert.ok(log.includes(`## 1.5.0 (${today})\n\n- hand note\n- first done\n- second done\n`), log);
  assert.ok(!log.includes('<!--'));
  assert.ok(!/## Unreleased/.test(log));
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8')).version, '1.5.0');
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf-8')).version, '1.5.0');
  assert.match(h.git(root, 'log', '-1', '--format=%B'), /^chore\(release\): 1\.5\.0\n\nBump: minor/);
  assert.ok(h.git(root, 'tag').split('\n').includes('v1.5.0'));
  assert.strictEqual(h.git(root, 'status', '--porcelain'), '');

  const released = h.git(root, 'show', '--name-only', '--format=', 'HEAD').split('\n').sort();
  assert.deepStrictEqual(released, ['.work/gps-config.json', 'CHANGELOG.md', ...fragments.map((n) => `.work/changelog/${n}`), 'package.json', 'plugin.json'].sort());
  const left = path.join(root, '.work', 'changelog');
  assert.deepStrictEqual(fs.existsSync(left) ? fs.readdirSync(left) : [], [], 'fragments deleted');
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(root, '.work', 'gps-config.json'), 'utf-8')).release.versionFiles, ['package.json', 'plugin.json']);
  const head = h.git(root, 'rev-parse', 'HEAD');
  h.assertFails(h.run(root, 'release.js', ['--version', '1.5.0']), 1);
  assert.strictEqual(h.git(root, 'rev-parse', 'HEAD'), head);
  assert.strictEqual(h.git(root, 'status', '--porcelain'), '');
}

// Level written is the one of the version chosen (current → target), not the fragments'.
{
  const { root } = finished('gps-rel2-', 'feat', 'minor');
  const res = h.ok(root, 'release.js', ['--version', '3.0.0']);
  assert.match(res.out, /1\.4\.2 → 3\.0\.0 \(major\)/);
  assert.match(res.err, /not checked against origin \(no origin remote\)/, 'no origin: a warning, the cut goes on');
  assert.match(res.out, /Next: .*release\.js --push/);
  assert.match(h.git(root, 'log', '-1', '--format=%B'), /Bump: major/);
}

// First release with .work/ git-ignored: the config is saved but stays out of the commit.
{
  const { root, id: onlyId } = finishedWorkIgnored('gps-rel13-');
  assert.ok(fs.existsSync(path.join(root, '.work', 'changelog', `${onlyId}.md`)));
  h.ok(root, 'release.js', ['--version', '1.5.0']);
  assert.match(h.git(root, 'log', '-1', '--format=%s'), /^chore\(release\): 1\.5\.0$/);
  assert.ok(!fs.existsSync(path.join(root, '.work', 'changelog', `${onlyId}.md`)), 'fragment deleted from disk');
  assert.ok(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf-8').includes('- only done'));
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

// A Cargo workspace: [workspace.package] version is bumped and the path pins
// that equal it follow, in the release commit; other pins and registry deps stay.
{
  const root = h.gitProject('gps-rel-cargo-');
  const put = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  };
  const get = (rel) => fs.readFileSync(path.join(root, rel), 'utf-8');
  const rootManifest = [
    '[workspace]',
    'members = ["crates/*", "tools/cli"]',
    '',
    '[workspace.package]',
    'version = "0.3.0" # the one version',
    '',
    '[workspace.dependencies]',
    'core = { path = "crates/core", version = "0.3.0" }',
    'old = { path = "crates/old", version = "0.2.0" }',
    'serde = { version = "0.3.0" }',
    '',
  ].join('\n');
  const coreManifest = '[package]\r\nname = "core"\r\nversion.workspace = true\r\n\r\n[dependencies]\r\nutil = { path = "../util", version = "0.3.0" } # keep\r\n';
  const utilManifest = '[package]\nname = "util"\nversion.workspace = true\n\n[dependencies.core]\npath = "../core"\nversion = "0.3.0"\n';
  const cliManifest = '[package]\nname = "cli"\nversion.workspace = true\n\n[dev-dependencies]\nutil = { path = "../../crates/util", version = "0.2.0" }\nlog = "0.3.0"\n';
  put('Cargo.toml', rootManifest);
  put('crates/core/Cargo.toml', coreManifest);
  put('crates/util/Cargo.toml', utilManifest);
  put('tools/cli/Cargo.toml', cliManifest);
  h.git(root, 'add', '.');
  h.git(root, 'commit', '-q', '-m', 'add workspace');
  finishSession(root, 'only', 'feat', 'minor');

  const res = h.ok(root, 'release.js', ['--version', '0.4.0']);
  assert.match(res.out, /0\.3\.0 → 0\.4\.0/);
  assert.strictEqual(get('Cargo.toml'), rootManifest
    .replace('version = "0.3.0" # the one version', 'version = "0.4.0" # the one version')
    .replace('core = { path = "crates/core", version = "0.3.0" }', 'core = { path = "crates/core", version = "0.4.0" }'));
  assert.strictEqual(get('crates/core/Cargo.toml'), coreManifest.replace('"0.3.0"', '"0.4.0"'));
  assert.strictEqual(get('crates/util/Cargo.toml'), utilManifest.replace('version = "0.3.0"', 'version = "0.4.0"'));
  assert.strictEqual(get('tools/cli/Cargo.toml'), cliManifest, 'a different pin and a registry dependency are left alone');
  const files = h.git(root, 'show', '--name-only', '--format=', 'HEAD').split('\n');
  for (const f of ['Cargo.toml', 'crates/core/Cargo.toml', 'crates/util/Cargo.toml']) assert.ok(files.includes(f), `${f} in the release commit`);
  assert.ok(!files.includes('tools/cli/Cargo.toml'));
  assert.strictEqual(h.git(root, 'status', '--porcelain'), '');
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

// An invalid fragment: suggest and cut refuse, naming the file; nothing changes.
{
  const { root } = finished('gps-rel12-', 'fix', 'patch');
  fs.writeFileSync(path.join(root, '.work', 'changelog', 'zz-odd.md'), '---\nbump: huge\nfloor: patch\n---\n- odd\n');
  h.git(root, 'add', '.work/changelog/zz-odd.md');
  h.git(root, 'commit', '-q', '-m', 'hand fragment');
  const head = h.git(root, 'rev-parse', 'HEAD');
  h.assertFails(h.run(root, 'release.js'), 1, /\.work\/changelog\/zz-odd\.md: bump "huge"/);
  h.assertFails(h.run(root, 'release.js', ['--version', '1.4.3']), 1, /zz-odd\.md/);
  assert.strictEqual(h.git(root, 'rev-parse', 'HEAD'), head);
  assert.strictEqual(h.git(root, 'status', '--porcelain'), '');
  assert.strictEqual(h.git(root, 'tag'), '');
}

// A fragment whose body is not a changelog entry: refused like any invalid fragment.
{
  const { root } = finished('gps-rel16-', 'fix', 'patch');
  fs.writeFileSync(path.join(root, '.work', 'changelog', 'zz-prose.md'), '---\nbump: patch\nfloor: patch\n---\njust prose\n');
  h.git(root, 'add', '.work/changelog/zz-prose.md');
  h.git(root, 'commit', '-q', '-m', 'hand fragment');
  const head = h.git(root, 'rev-parse', 'HEAD');
  h.assertFails(h.run(root, 'release.js'), 1, /\.work\/changelog\/zz-prose\.md: unparsable body/);
  h.assertFails(h.run(root, 'release.js', ['--version', '1.4.3']), 1, /\.work\/changelog\/zz-prose\.md: unparsable body/);
  assert.strictEqual(h.git(root, 'rev-parse', 'HEAD'), head);
  assert.strictEqual(h.git(root, 'status', '--porcelain'), '');
  assert.strictEqual(h.git(root, 'tag'), '');
}

// A release commit that fails keeps the fragments on disk (here .work/ is
// ignored, so they exist nowhere else); a later run releases them.
{
  const { root, id: id } = finishedWorkIgnored('gps-rel17-');
  const fragment = path.join(root, '.work', 'changelog', `${id}.md`);
  const hook = path.join(root, '.git', 'hooks', 'pre-commit');
  fs.writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const head = h.git(root, 'rev-parse', 'HEAD');
  h.assertFails(h.run(root, 'release.js', ['--version', '1.5.0']), 1, /written but not committed/);
  assert.ok(fs.existsSync(fragment), 'the fragment survives the failed commit');
  assert.strictEqual(h.git(root, 'rev-parse', 'HEAD'), head);
  fs.unlinkSync(hook);
  // Undo the uncommitted release by hand, then run it again.
  h.git(root, 'reset', '-q');
  h.git(root, 'checkout', '-q', '--', '.');
  fs.rmSync(path.join(root, 'CHANGELOG.md'));
  assert.strictEqual(h.git(root, 'status', '--porcelain'), '');
  h.ok(root, 'release.js', ['--version', '1.5.0']);
  assert.ok(!fs.existsSync(fragment));
  assert.ok(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf-8').includes('- only done'));
}

// Tracked fragments and a failed commit: still on disk, nothing committed.
{
  const { root, id } = finished('gps-rel18-', 'feat', 'minor');
  const fragment = path.join(root, '.work', 'changelog', `${id}.md`);
  const hook = path.join(root, '.git', 'hooks', 'pre-commit');
  fs.writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const head = h.git(root, 'rev-parse', 'HEAD');
  h.assertFails(h.run(root, 'release.js', ['--version', '1.5.0']), 1, /written but not committed/);
  assert.ok(fs.existsSync(fragment));
  assert.strictEqual(h.git(root, 'rev-parse', 'HEAD'), head);
  assert.strictEqual(h.git(root, 'ls-files', '--', `.work/changelog/${id}.md`), `.work/changelog/${id}.md`, 'the removal is unstaged again');
  assert.strictEqual(h.git(root, 'status', '--porcelain', '--', '.work/changelog'), '', 'the fragment is as in HEAD');
  const st = h.git(root, 'status', '--porcelain').split('\n').sort();
  assert.deepStrictEqual(st, ['A  CHANGELOG.md', 'M  .work/gps-config.json', 'M  package.json'].sort(), 'the release files stay staged');
}

// A failed commit's hint is runnable: tracked fragments get git rm, the
// command names no pseudo-command.
{
  const { root, id } = finished('gps-rel21-', 'feat', 'minor');
  const hook = path.join(root, '.git', 'hooks', 'pre-commit');
  fs.writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const res = h.run(root, 'release.js', ['--version', '1.5.0']);
  h.assertFails(res, 1, /written but not committed/);
  assert.doesNotMatch(res.err, /&& delete /);
  assert.match(res.err, new RegExp(`git rm -q -- "\\.work/changelog/${id}\\.md" && git commit `));
  assert.match(res.err, /&& git tag -a v1\.5\.0 -m 1\.5\.0\n/);
}

// A non-normalized changelog.path ("./CHANGELOG.md") with tracked fragments releases.
{
  const { root, id } = finished('gps-rel19-', 'feat', 'minor');
  const cfgFile = path.join(root, '.work', 'gps-config.json');
  const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf-8'));
  fs.writeFileSync(cfgFile, JSON.stringify({ ...cfg, changelog: { path: './CHANGELOG.md' }, release: { versionFiles: ['./package.json'] } }, null, 2) + '\n');
  h.git(root, 'commit', '-q', '-m', 'cfg', '--', '.work/gps-config.json');
  h.ok(root, 'release.js', ['--version', '1.5.0']);
  assert.deepStrictEqual(h.git(root, 'show', '--name-status', '--format=', 'HEAD').split('\n').sort(),
    [`D\t.work/changelog/${id}.md`, 'A\tCHANGELOG.md', 'M\tpackage.json'].sort());
  assert.strictEqual(h.git(root, 'status', '--porcelain'), '');
  assert.ok(h.git(root, 'tag').split('\n').includes('v1.5.0'));
}

// A release saves the source beside the list; a legacy config without a source
// is re-detected and the new list lands in the release commit; manual is kept.
{
  const readCfg = (root) => JSON.parse(fs.readFileSync(path.join(root, '.work', 'gps-config.json'), 'utf-8')).release;
  const withList = (prefix, release) => {
    const { root } = finished(prefix, 'feat', 'minor');
    fs.writeFileSync(path.join(root, 'plugin.json'), JSON.stringify({ name: 'x', version: '1.4.2' }) + '\n');
    const cfgFile = path.join(root, '.work', 'gps-config.json');
    const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf-8'));
    fs.writeFileSync(cfgFile, JSON.stringify({ ...cfg, release }, null, 2) + '\n');
    h.git(root, 'add', 'plugin.json', '.work/gps-config.json');
    h.git(root, 'commit', '-q', '-m', 'cfg and manifest');
    return root;
  };

  const first = finished('gps-rel23-', 'feat', 'minor').root;
  h.ok(first, 'release.js', ['--version', '1.5.0']);
  assert.strictEqual(readCfg(first).versionFilesSource, 'detected');

  const legacy = withList('gps-rel24-', { versionFiles: ['package.json'] });
  const res = h.ok(legacy, 'release.js', ['--version', '1.5.0']);
  assert.match(res.err, /did not hold: plugin\.json/);
  assert.deepStrictEqual(readCfg(legacy).versionFiles, ['package.json', 'plugin.json']);
  assert.strictEqual(readCfg(legacy).versionFilesSource, 'detected');
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(legacy, 'plugin.json'), 'utf-8')).version, '1.5.0');
  assert.ok(h.git(legacy, 'show', '--name-only', '--format=', 'HEAD').split('\n').includes('.work/gps-config.json'));
  assert.strictEqual(h.git(legacy, 'status', '--porcelain'), '');

  // Re-detection never drops a saved entry detection does not know.
  const custom = withList('gps-rel26-', { versionFiles: ['packages/a/package.json', 'package.json'] });
  fs.mkdirSync(path.join(custom, 'packages', 'a'), { recursive: true });
  fs.writeFileSync(path.join(custom, 'packages', 'a', 'package.json'), JSON.stringify({ name: 'a', version: '1.4.2' }) + '\n');
  h.git(custom, 'add', 'packages');
  h.git(custom, 'commit', '-q', '-m', 'add package a');
  const kept = h.ok(custom, 'release.js', ['--version', '1.5.0']);
  assert.match(kept.err, /did not hold: plugin\.json/);
  assert.deepStrictEqual(readCfg(custom).versionFiles, ['packages/a/package.json', 'package.json', 'plugin.json']);
  const customVersion = (rel) => JSON.parse(fs.readFileSync(path.join(custom, rel), 'utf-8')).version;
  assert.deepStrictEqual(['packages/a/package.json', 'package.json', 'plugin.json'].map(customVersion), ['1.5.0', '1.5.0', '1.5.0']);
  assert.ok(h.git(custom, 'show', '--name-only', '--format=', 'HEAD').split('\n').includes('packages/a/package.json'));
  assert.strictEqual(h.git(custom, 'status', '--porcelain'), '');

  const manual = withList('gps-rel25-', { versionFiles: ['package.json'], versionFilesSource: 'manual' });
  h.ok(manual, 'release.js', ['--version', '1.5.0']);
  assert.deepStrictEqual(readCfg(manual), { versionFiles: ['package.json'], versionFilesSource: 'manual' });
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(manual, 'plugin.json'), 'utf-8')).version, '1.4.2', 'manual list is never re-detected');
  assert.ok(!h.git(manual, 'show', '--name-only', '--format=', 'HEAD').split('\n').includes('.work/gps-config.json'));
}

// A nested changelog (docs/CHANGELOG.md) with tracked fragments releases.
{
  const { root, id } = finished('gps-rel20-', 'feat', 'minor');
  const cfgFile = path.join(root, '.work', 'gps-config.json');
  const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf-8'));
  fs.writeFileSync(cfgFile, JSON.stringify({ ...cfg, changelog: { path: 'docs\\CHANGELOG.md' } }, null, 2) + '\n');
  h.git(root, 'commit', '-q', '-m', 'cfg', '--', '.work/gps-config.json');
  h.ok(root, 'release.js', ['--version', '1.5.0']);
  assert.ok(fs.readFileSync(path.join(root, 'docs', 'CHANGELOG.md'), 'utf-8').includes('- only done'));
  assert.ok(h.git(root, 'show', '--name-status', '--format=', 'HEAD').split('\n').includes(`D\t.work/changelog/${id}.md`));
  assert.strictEqual(h.git(root, 'status', '--porcelain'), '');
}

// A fragment force-added under an ignored .work/: the release commit records its deletion.
{
  const { root, id: id } = finishedWorkIgnored('gps-rel22-');
  h.git(root, 'add', '-f', '--', `.work/changelog/${id}.md`);
  h.git(root, 'commit', '-q', '-m', 'force-add fragment');
  h.ok(root, 'release.js', ['--version', '1.5.0']);
  assert.ok(h.git(root, 'show', '--name-status', '--format=', 'HEAD').split('\n').includes(`D\t.work/changelog/${id}.md`));
  assert.strictEqual(h.git(root, 'ls-files', '--', '.work/changelog'), '');
  assert.ok(!fs.existsSync(path.join(root, '.work', 'changelog', `${id}.md`)));
  assert.strictEqual(h.git(root, 'status', '--porcelain'), '');
}

// 0.x: minor and major give the same version, listed once.
{
  const root = project('gps-rel14-', '0.4.2');
  finishSession(root, 'only', 'feat', 'minor');
  const res = h.ok(root, 'release.js');
  assert.match(res.out, /0\.4\.2 → 0\.5\.0 \(minor: 1 session\(s\)\)/);
  assert.match(res.out, /^Candidates: patch 0\.4\.3, minor\/major 0\.5\.0$/m);
  assert.deepStrictEqual(h.json(root, 'release.js').alternatives, { patch: '0.4.3', minor: '0.5.0', major: '0.5.0' });
}

// Hand-written Unreleased bullets and no fragment: patch, with a warning.
{
  const root = project('gps-rel15-');
  fs.writeFileSync(path.join(root, 'CHANGELOG.md'), '# Changelog\n\n## Unreleased\n\n- by hand\n\n## 1.4.2\n\n- old\n');
  h.git(root, 'add', 'CHANGELOG.md');
  h.git(root, 'commit', '-q', '-m', 'docs: by hand');
  const res = h.ok(root, 'release.js');
  assert.match(res.out, /1\.4\.2 → 1\.4\.3 \(patch: 0 session\(s\)\)/);
  assert.match(res.err, /No changelog fragment/);
  h.ok(root, 'release.js', ['--version', '1.4.3']);
  const log = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf-8');
  assert.ok(log.includes(`## 1.4.3 (${today})\n\n- by hand\n\n## 1.4.2\n`), log);
  // No gps config yet in this project: release saves it (first release).
  assert.deepStrictEqual(h.git(root, 'show', '--name-only', '--format=', 'HEAD').split('\n').sort(), ['.work/gps-config.json', 'CHANGELOG.md', 'package.json'].sort());
}

// Nothing to release / changelog disabled.
{
  const root = project('gps-rel5-');
  h.assertFails(h.run(root, 'release.js'), 1, /Nothing to release: no changelog fragment and no entry under "## Unreleased"[\s\S]*git pull/);
  finishSession(root, 'only', 'feat', 'minor');
  fs.writeFileSync(path.join(root, '.work', 'gps-config.json'), JSON.stringify({ github: { enabled: false }, changelog: { enabled: false } }));
  h.git(root, 'commit', '-q', '-am', 'config');
  h.assertFails(h.run(root, 'release.js'), 1, /disabled/);
}

// A failed tag resumes: the commit exists, only the tag is recreated.
{
  const { root } = finished('gps-rel6-', 'feat', 'minor');
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
  const { root } = finished('gps-rel7-', 'feat', 'minor');
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
  execFileSync('git', ['init', '-q', '--bare', '--initial-branch=main', bare], { stdio: 'ignore' });
  h.git(root, 'remote', 'add', 'origin', bare);
  h.git(root, 'push', '-q', 'origin', 'main');
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-rel10-other-'));
  execFileSync('git', ['clone', '-q', bare, other], { stdio: 'ignore' });
  h.git(other, 'config', 'user.email', 'o@example.com');
  h.git(other, 'config', 'user.name', 'Other');
  finishSession(root, 'only', 'feat', 'minor');

  // The cut fetches origin: behind it, the cut is refused, changing nothing.
  fs.writeFileSync(path.join(other, 'other.js'), '// x');
  h.git(other, 'add', '.');
  h.git(other, 'commit', '-q', '-m', 'other');
  h.git(other, 'push', '-q', 'origin', 'main');
  const headBefore = h.git(root, 'rev-parse', 'HEAD');
  const fragmentsBefore = fs.readdirSync(path.join(root, '.work', 'changelog'));
  assert.match(h.ok(root, 'release.js').out, /1\.5\.0/, 'suggest stays read-only and works behind origin');
  h.assertFails(h.run(root, 'release.js', ['--version', '1.5.0']), 1, /behind origin\/main[\s\S]*git pull/);
  assert.strictEqual(h.git(root, 'rev-parse', 'HEAD'), headBefore);
  assert.ok(!fs.existsSync(path.join(root, 'CHANGELOG.md')));
  assert.deepStrictEqual(fs.readdirSync(path.join(root, '.work', 'changelog')), fragmentsBefore);
  assert.strictEqual(h.git(root, 'tag'), '');
  assert.strictEqual(h.git(root, 'status', '--porcelain'), '');
  h.git(root, 'pull', '-q', '--no-rebase', '--no-edit', 'origin', 'main');
  h.ok(root, 'release.js', ['--version', '1.5.0']);

  // Another clone pushes after the cut: the atomic push is rejected.
  fs.writeFileSync(path.join(other, 'other2.js'), '// y');
  h.git(other, 'add', '.');
  h.git(other, 'commit', '-q', '-m', 'other 2');
  h.git(other, 'push', '-q', 'origin', 'main');
  h.assertFails(h.run(root, 'release.js', ['--push']), 1, /Push failed/);
  assert.strictEqual(execFileSync('git', ['--git-dir', bare, 'tag'], { encoding: 'utf-8' }).trim(), '', 'atomic: no tag on origin');
  h.git(root, 'push', '-q', 'origin', 'v1.5.0');
  const again = h.run(root, 'release.js', ['--push']);
  h.assertFails(again, 1, /Push failed/);
  assert.doesNotMatch(again.out, /already on origin/);
}

// --push checks the base branch and the config before pushing anything.
{
  const { root } = finished('gps-rel11-', 'feat', 'minor');
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

// release.postBump: consent per exact list, run in order, changes join the release
// commit, a failure puts everything back.
{
  const cfgOf = (root) => JSON.parse(fs.readFileSync(path.join(root, '.work', 'gps-config.json'), 'utf-8'));
  // Line endings as git checks them out (core.autocrlf) do not matter here.
  const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf-8').replace(/\r\n/g, '\n');
  const STEP = 'node step.js';
  // A finished project (version files already saved) holding lock.txt, step.js (appends its argument to lock.txt; "c" also creates
  // made.txt) and fail.js, with the given lists in the committed config.
  const withPost = (prefix, postBump, postBumpApproved) => {
    const { root } = finished(prefix, 'feat', 'minor');
    fs.writeFileSync(path.join(root, 'lock.txt'), 'old\n');
    fs.writeFileSync(path.join(root, 'step.js'), "const fs = require('fs'); fs.appendFileSync('lock.txt', process.argv[2] + '\\n'); if (process.argv[2] === 'c') fs.writeFileSync('made.txt', 'x');\n");
    fs.writeFileSync(path.join(root, 'fail.js'), "console.log('partial'); console.error('boom'); process.exit(3);\n");
    const cfg = cfgOf(root);
    fs.writeFileSync(path.join(root, '.work', 'gps-config.json'),
      JSON.stringify({ ...cfg, release: { ...cfg.release, versionFiles: ['package.json'], versionFilesSource: 'detected', postBump, ...(postBumpApproved ? { postBumpApproved } : {}) } }, null, 2) + '\n');
    h.git(root, 'add', 'lock.txt', 'step.js', 'fail.js', '.work/gps-config.json');
    h.git(root, 'commit', '-q', '-m', 'add post-bump setup');
    return root;
  };
  const committed = (root) => h.git(root, 'show', '--name-only', '--format=', 'HEAD').split('\n').sort();

  // Unapproved: the suggestion shows them, every cut refuses before writing anything.
  const fresh = withPost('gps-rel-pb1-', [`${STEP} a`, `${STEP} b`]);
  const head = h.git(fresh, 'rev-parse', 'HEAD');
  const sug = h.ok(fresh, 'release.js');
  assert.match(sug.out, /Post-bump commands \(NOT approved yet\):\n  node step\.js a\n  node step\.js b/);
  assert.match(sug.out, /Next: .*approve the post-bump commands.*release\.js --version 1\.5\.0 --approve-post-bump/);
  assert.deepStrictEqual([h.json(fresh, 'release.js').postBump, h.json(fresh, 'release.js').postBumpApproved], [[`${STEP} a`, `${STEP} b`], false]);
  for (const args of [['--version', '1.5.0'], ['--publish'], ['--publish', '--version', '1.5.0']]) {
    const res = h.run(fresh, 'release.js', args);
    h.assertFails(res, 1, /release\.postBump is not approved; nothing was changed/);
    assert.match(res.err, /node step\.js a\n\s+node step\.js b/, 'names the commands');
    assert.match(res.err, /--version 1\.5\.0 --approve-post-bump/);
  }
  assert.strictEqual(h.git(fresh, 'rev-parse', 'HEAD'), head);
  assert.strictEqual(h.git(fresh, 'status', '--porcelain'), '', 'a refusal writes nothing');
  assert.strictEqual(read(fresh, 'lock.txt'), 'old\n');
  assert.ok(!h.git(fresh, 'tag').includes('v1.5.0'));
  h.assertFails(h.run(fresh, 'release.js', ['--approve-post-bump']), 2, /--version or --publish/);
  h.assertFails(h.run(fresh, 'release.js', ['--push', '--approve-post-bump']), 2);

  // Approving records the exact list; the commands ran in order, the config joins the commit and the tree is clean.
  const res = h.ok(fresh, 'release.js', ['--version', '1.5.0', '--approve-post-bump']);
  assert.match(res.out, /Post-bump: ran 2 command\(s\), 1 changed file\(s\) joined the commit\./);
  assert.strictEqual(read(fresh, 'lock.txt'), 'old\na\nb\n');
  assert.deepStrictEqual(cfgOf(fresh).release.postBumpApproved, [`${STEP} a`, `${STEP} b`]);
  assert.ok(committed(fresh).includes('lock.txt'));
  assert.ok(committed(fresh).includes('.work/gps-config.json'));
  assert.strictEqual(h.git(fresh, 'status', '--porcelain'), '', 'approval leaves a clean tree');
  assert.ok(h.git(fresh, 'tag').split('\n').includes('v1.5.0'));

  // An approved list runs without the flag, and writes no config.
  const approved = withPost('gps-rel-pb2-', [`${STEP} a`, `${STEP} c`], [`${STEP} a`, `${STEP} c`]);
  assert.match(h.ok(approved, 'release.js').out, /Post-bump commands \(approved\)/);
  assert.doesNotMatch(h.ok(approved, 'release.js').out, /--approve-post-bump/);
  const cut = h.ok(approved, 'release.js', ['--version', '1.5.0']);
  assert.match(cut.err, /created untracked file\(s\), left out of the release commit: made\.txt/);
  assert.strictEqual(read(approved, 'lock.txt'), 'old\na\nc\n');
  assert.ok(committed(approved).includes('lock.txt'));
  assert.ok(!committed(approved).includes('made.txt'));
  assert.ok(!committed(approved).includes('.work/gps-config.json'), 'nothing changed in the config');
  assert.strictEqual(h.git(approved, 'status', '--porcelain'), '?? made.txt', 'the untracked file stays out');

  // A changed list (a command added, or reordered) refuses again, naming the commands.
  for (const list of [[`${STEP} a`, `${STEP} b`], [`${STEP} c`, `${STEP} a`], [`${STEP} a`]]) {
    const changed = withPost('gps-rel-pb3-', list, [`${STEP} a`, `${STEP} c`]);
    const refused = h.run(changed, 'release.js', ['--version', '1.5.0']);
    h.assertFails(refused, 1, /release\.postBump changed since it was approved; nothing was changed/);
    assert.ok(refused.err.includes(list[0]), 'names the commands');
    assert.strictEqual(h.git(changed, 'status', '--porcelain'), '');
    assert.strictEqual(read(changed, 'lock.txt'), 'old\n');
  }

  // A failing command undoes the cut: changelog, version files, config, tracked changes; nothing committed or tagged.
  const failing = withPost('gps-rel-pb4-', [`${STEP} a`, 'node fail.js'], null);
  const failHead = h.git(failing, 'rev-parse', 'HEAD');
  const cfgBefore = read(failing, '.work/gps-config.json');
  const fragmentsBefore = fs.readdirSync(path.join(failing, '.work', 'changelog')).sort();
  const failed = h.run(failing, 'release.js', ['--version', '1.5.0', '--approve-post-bump']);
  h.assertFails(failed, 1, /Post-bump command failed: node fail\.js/);
  assert.match(failed.err, /boom/);
  assert.match(failed.err, /nothing was committed or tagged/);
  assert.strictEqual(h.git(failing, 'rev-parse', 'HEAD'), failHead);
  assert.strictEqual(h.git(failing, 'status', '--porcelain'), '', 'the tree is clean again');
  assert.strictEqual(read(failing, 'lock.txt'), 'old\n', 'the first command\'s change is undone');
  assert.strictEqual(read(failing, '.work/gps-config.json'), cfgBefore, 'the approval is not kept');
  assert.strictEqual(JSON.parse(read(failing, 'package.json')).version, '1.4.2');
  assert.ok(!fs.existsSync(path.join(failing, 'CHANGELOG.md')));
  assert.deepStrictEqual(fs.readdirSync(path.join(failing, '.work', 'changelog')).sort(), fragmentsBefore);
  assert.ok(!h.git(failing, 'tag').includes('v1.5.0'));
  // Fix the list; the rerun works.
  const cfg = cfgOf(failing);
  fs.writeFileSync(path.join(failing, '.work', 'gps-config.json'), JSON.stringify({ ...cfg, release: { ...cfg.release, postBump: [`${STEP} a`] } }, null, 2) + '\n');
  h.git(failing, 'commit', '-q', '-m', 'fix list', '--', '.work/gps-config.json');
  h.ok(failing, 'release.js', ['--version', '1.5.0', '--approve-post-bump']);
  assert.strictEqual(read(failing, 'lock.txt'), 'old\na\n');
  assert.ok(h.git(failing, 'tag').split('\n').includes('v1.5.0'));
  assert.strictEqual(h.git(failing, 'status', '--porcelain'), '');

  // Failure with a first-ever release (no CHANGELOG yet) and a command that created a file: reported, not deleted.
  const created = withPost('gps-rel-pb5-', [`${STEP} c`, 'node fail.js'], null);
  const createdFail = h.run(created, 'release.js', ['--version', '1.5.0', '--approve-post-bump']);
  h.assertFails(createdFail, 1, /Untracked files left behind: made\.txt/);
  assert.match(createdFail.err, /Remove or commit those untracked files/);
  assert.doesNotMatch(failed.err, /Remove or commit those untracked files/, 'only when some are left');
  assert.strictEqual(read(created, 'lock.txt'), 'old\n');
  assert.strictEqual(h.git(created, 'status', '--porcelain'), '?? made.txt');
  h.assertFails(h.run(created, 'release.js', ['--version', '1.5.0', '--approve-post-bump']), 1, /uncommitted changes/);

  // A command printing more than the default 1 MB buffer: a success stays one, a failure still reports its end.
  const big = withPost('gps-rel-pb6-', ['node big.js'], ['node big.js']);
  fs.writeFileSync(path.join(big, 'big.js'), "process.stdout.write('x'.repeat(2 * 1024 * 1024)); require('fs').appendFileSync('lock.txt', 'big\\n'); if (process.argv[2] === 'fail') { console.error('boom'); process.exitCode = 3; }\n");
  h.git(big, 'add', 'big.js');
  h.git(big, 'commit', '-q', '-m', 'add big');
  h.ok(big, 'release.js', ['--version', '1.5.0']);
  assert.strictEqual(read(big, 'lock.txt'), 'old\nbig\n');
  assert.ok(committed(big).includes('lock.txt'));
  const bigFail = withPost('gps-rel-pb7-', ['node big.js fail'], ['node big.js fail']);
  fs.copyFileSync(path.join(big, 'big.js'), path.join(bigFail, 'big.js'));
  h.git(bigFail, 'add', 'big.js');
  h.git(bigFail, 'commit', '-q', '-m', 'add big');
  const bigFailed = h.run(bigFail, 'release.js', ['--version', '1.5.0']);
  h.assertFails(bigFailed, 1, /Post-bump command failed: node big\.js fail/);
  assert.match(bigFailed.err, /boom/);
  assert.ok(bigFailed.err.length < 10000, 'the output is cut down');
  assert.strictEqual(h.git(bigFail, 'status', '--porcelain'), '');

  // git cannot list the changes: the cut stops rather than commit without them.
  const broken = withPost('gps-rel-pb8-', ['node breakindex.js'], ['node breakindex.js']);
  fs.writeFileSync(path.join(broken, 'breakindex.js'), "require('fs').writeFileSync('.git/index', 'junk');\n");
  h.git(broken, 'add', 'breakindex.js');
  h.git(broken, 'commit', '-q', '-m', 'add breakindex');
  const brokenHead = h.git(broken, 'rev-parse', 'HEAD');
  const brokenRes = h.run(broken, 'release.js', ['--version', '1.5.0']);
  h.assertFails(brokenRes, 1, /Cannot list the files the post-bump commands changed/);
  assert.match(brokenRes.err, /restore them by hand/);
  assert.strictEqual(h.git(broken, 'rev-parse', 'HEAD'), brokenHead);
  assert.ok(!h.git(broken, 'tag').includes('v1.5.0'));

  // --publish --approve-post-bump: approved, cut, pushed, all in one call.
  const { execFileSync } = require('child_process');
  const pub = withPost('gps-rel-pb9-', [`${STEP} a`]);
  const origin = fs.mkdtempSync(path.join(require('os').tmpdir(), 'gps-rel-pb9-origin-'));
  execFileSync('git', ['init', '-q', '--bare', origin], { stdio: 'ignore' });
  h.git(pub, 'remote', 'add', 'origin', origin);
  h.ok(pub, 'release.js', ['--publish', '--approve-post-bump']);
  const inOrigin = (...a) => execFileSync('git', ['--git-dir', origin, ...a], { encoding: 'utf-8' }).trim();
  assert.strictEqual(inOrigin('rev-parse', 'refs/heads/main'), h.git(pub, 'rev-parse', 'HEAD'));
  assert.ok(inOrigin('tag').split('\n').includes('v1.5.0'));
  assert.strictEqual(inOrigin('show', 'main:lock.txt').replace(/\r\n/g, '\n'), 'old\na');
  assert.deepStrictEqual(JSON.parse(inOrigin('show', 'main:.work/gps-config.json')).release.postBumpApproved, [`${STEP} a`]);
  assert.strictEqual(h.git(pub, 'status', '--porcelain'), '');
}

h.done('release.test.js');

// --publish: cut and push in one call; resumes after a failed push.
{
  const { execFileSync } = require('child_process');
  const root = project('gps-rel10-');
  const bare = fs.mkdtempSync(path.join(require('os').tmpdir(), 'gps-rel10-origin-'));
  execFileSync('git', ['init', '-q', '--bare', bare], { stdio: 'ignore' });
  h.git(root, 'remote', 'add', 'origin', path.join(bare, 'missing'));
  finishSession(root, 'only', 'feat', 'minor');
  h.assertFails(h.run(root, 'release.js', ['--publish', '--push']), 2);
  // The push fails: the release is cut and tagged, and nothing else happens.
  h.assertFails(h.run(root, 'release.js', ['--publish']), 1, /git push --atomic --follow-tags origin main/);
  assert.match(h.git(root, 'log', '-1', '--format=%s'), /^chore\(release\): 1\.5\.0$/);
  // Fix the origin and run it again: it goes straight to the push.
  h.git(root, 'remote', 'set-url', 'origin', bare);
  const before = h.git(root, 'rev-parse', 'HEAD');
  const res = h.ok(root, 'release.js', ['--publish']);
  assert.match(res.out, /1.5.0/);
  assert.strictEqual(h.git(root, 'rev-parse', 'HEAD'), before, 'no second release commit');
  const remote = (...a) => execFileSync('git', ['--git-dir', bare, ...a], { encoding: 'utf-8' }).trim();
  assert.strictEqual(remote('rev-parse', 'refs/heads/main'), before);
  assert.ok(remote('tag').split('\n').includes('v1.5.0'));

  // With a given version.
  const root2 = project('gps-rel11-');
  const bare2 = fs.mkdtempSync(path.join(require('os').tmpdir(), 'gps-rel11-origin-'));
  execFileSync('git', ['init', '-q', '--bare', bare2], { stdio: 'ignore' });
  h.git(root2, 'remote', 'add', 'origin', bare2);
  finishSession(root2, 'only', 'feat', 'minor');
  const data = JSON.parse(h.ok(root2, 'release.js', ['--publish', '--version', '2.0.0', '--json']).out);
  assert.strictEqual(data.version, '2.0.0');
  assert.strictEqual(data.pushed, true);
  // A refusal (nothing left to release, HEAD pushed) stops before any push.
  h.assertFails(h.run(root2, 'release.js', ['--publish', '--version', '2.1.0']), 1, /Nothing to release/);
}
