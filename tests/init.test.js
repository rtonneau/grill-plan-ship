// tests/init.test.js — init.js (/gps init [--apply [--unignore-work]])
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const h = require('./helpers');

{
  // A fresh repo: the check reports what is missing and changes nothing.
  const root = h.gitProject();
  const before = h.git(root, 'status', '--porcelain');
  const res = h.ok(root, 'init.js');
  assert.match(res.out, /- \*\*Git:\*\* repository, on branch main/);
  assert.match(res.out, /- \*\*GitHub:\*\* detected off \(no "origin" remote\); not stored yet/);
  assert.match(res.out, /- \*\*\.gitignore:\*\* missing \.scratch\/, \.work\/sessions\/\.current-session/);
  assert.match(res.out, /- \*\*Setup commit:\*\* not made yet/);
  assert.match(res.out, /Next: confirm with the user, then run init\.js --apply\.$/m);
  assert.ok(!fs.existsSync(path.join(root, '.work')), 'the check writes nothing');
  assert.strictEqual(h.git(root, 'status', '--porcelain'), before);
  assert.strictEqual(h.json(root, 'init.js').ready, false);

  // --apply: config + .gitignore entries, one setup commit holding only those.
  fs.writeFileSync(path.join(root, 'wip.js'), 'not gps\n');
  const applied = h.ok(root, 'init.js', ['--apply']);
  assert.match(applied.out, /✅ Created \.work\/gps-config\.json: GitHub off/);
  assert.match(applied.out, /📦 Committed the setup \([0-9a-f]+\) on main: \.gitignore, \.work\/gps-config\.json/);
  assert.match(applied.out, /Next: \/gps start <feature-name>/);
  assert.strictEqual(h.git(root, 'log', '-1', '--format=%s'), 'chore(gps): set up gps');
  assert.strictEqual(h.git(root, 'show', '--name-only', '--format=', 'HEAD'), '.gitignore\n.work/gps-config.json');
  assert.strictEqual(h.git(root, 'status', '--porcelain'), '?? wip.js', 'other changes are left alone');

  // Idempotent: the check says ready, a second --apply changes and commits nothing.
  assert.match(h.ok(root, 'init.js').out, /✅ gps is set up\.\nNext: \/gps start <feature-name>/);
  const head = h.git(root, 'rev-parse', 'HEAD');
  assert.match(h.ok(root, 'init.js', ['--apply']).out, /Nothing to change: gps was already set up/);
  assert.strictEqual(h.git(root, 'rev-parse', 'HEAD'), head);
}

{
  // An older gps ignored .work/: reported; only --unignore-work removes the line.
  const root = h.gitProject();
  fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules/\n.work/\n');
  h.git(root, 'add', '.gitignore');
  h.git(root, 'commit', '-q', '-m', 'ignore');
  let res = h.ok(root, 'init.js');
  assert.match(res.out, /\*\*\.work\/:\*\* ⚠️ git-ignored/);
  assert.match(res.out, /with --unignore-work if the user wants \.work\/ committed/);

  res = h.ok(root, 'init.js', ['--apply']);
  assert.match(res.err, /\.work\/ is still git-ignored/);
  assert.strictEqual(h.git(root, 'show', '--name-only', '--format=', 'HEAD'), '.gitignore', 'the ignored config stays out');

  res = h.ok(root, 'init.js', ['--apply', '--unignore-work']);
  assert.match(res.out, /Removed "\.work\/" from \.gitignore/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, '.gitignore'), 'utf-8'), /^\.work\/$/m);
  assert.strictEqual(h.git(root, 'show', '--name-only', '--format=', 'HEAD'), '.gitignore\n.work/gps-config.json');
  assert.strictEqual(h.json(root, 'init.js').ready, true);
}

{
  // Uncommitted .gitignore edits of the user's own stay out of the setup commit.
  const root = h.gitProject();
  fs.writeFileSync(path.join(root, '.gitignore'), 'dist/\n');
  h.git(root, 'add', '.gitignore');
  h.git(root, 'commit', '-q', '-m', 'ignore');
  fs.appendFileSync(path.join(root, '.gitignore'), 'coverage/\n');
  const res = h.ok(root, 'init.js', ['--apply']);
  assert.match(res.err, /\.gitignore has changes of your own: commit it yourself/);
  assert.strictEqual(h.git(root, 'show', '--name-only', '--format=', 'HEAD'), '.work/gps-config.json');
  assert.strictEqual(h.git(root, 'diff', '--name-only'), '.gitignore', 'the user\'s edit is still there');
  assert.strictEqual(h.git(root, 'diff', '--cached', '--name-only'), '', 'and not staged');
}

{
  // A stored flag that differs from detection is reported, never changed.
  const root = h.gitProject();
  h.ok(root, 'init.js', ['--apply']);
  const file = path.join(root, '.work', 'gps-config.json');
  const config = JSON.parse(fs.readFileSync(file, 'utf-8'));
  config.github.enabled = true; // forced by hand, e.g. GitHub Enterprise
  fs.writeFileSync(file, JSON.stringify(config));
  const res = h.ok(root, 'init.js', ['--apply']);
  assert.match(res.out, /stored on/);
  assert.strictEqual(JSON.parse(fs.readFileSync(file, 'utf-8')).github.enabled, true);
  assert.match(h.ok(root, 'init.js').err, /differs from detection: \/gps config --rescan/);
}

{
  // Outside git: files written, nothing committed; usage errors are clean.
  const root = h.tempProject();
  assert.match(h.ok(root, 'init.js').out, /not a git repository: gps works, but commits nothing/);
  const res = h.ok(root, 'init.js', ['--apply']);
  assert.doesNotMatch(res.out, /Committed/);
  assert.ok(fs.existsSync(path.join(root, '.work', 'gps-config.json')));
  assert.match(fs.readFileSync(path.join(root, '.gitignore'), 'utf-8'), /^\.work\/sessions\/\.current-session$/m);
  assert.strictEqual(h.json(root, 'init.js').ready, true);
  h.assertFails(h.run(root, 'init.js', ['--unignore-work']), 2, /--unignore-work only goes with --apply/);
}

h.done('init.test.js');
