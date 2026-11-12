// tests/lib/git.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { gitProject, git: fixtureGit } = require('../helpers');
const {
  readRecentCommits, readGitStatus, commitFiles, restoreFromHead, commitExists, describeCommit,
  commitWorkDir, commitRemainingChanges, describeWorkCommit, branchesHolding, isIgnored, GPS_WORK_PATHS,
  failureReason, commitMessages, defaultBranch, isCleanTree, tagExists, createTag, headCommit, pushWithTags, remoteHasTag, remoteBranchAt, headSha, fetchBehind,
  safeGitArgs, gitPrivatePath, pushBranch, changedTrackedFiles,
} = require('../../skills/gps/scripts/lib/git');

const readGitStatusSummary = (root, dir) => readGitStatus(root, dir).session;

// changedTrackedFiles lists what differs from HEAD and reports a git error rather than an empty list.
{
  const root = gitProject('gps-changed-tracked-');
  fs.writeFileSync(path.join(root, 'app.js'), 'changed\n');
  fixtureGit(root, 'add', 'app.js');
  fixtureGit(root, 'commit', '-q', '-m', 'add app');
  assert.deepStrictEqual(changedTrackedFiles(root), { ok: true, files: [] });
  fs.writeFileSync(path.join(root, 'app.js'), 'changed again\n');
  assert.deepStrictEqual(changedTrackedFiles(root), { ok: true, files: ['app.js'] });
  fs.writeFileSync(path.join(root, '.git', 'index'), 'junk');
  const broken = changedTrackedFiles(root);
  assert.strictEqual(broken.ok, false);
  assert.ok(broken.reason);
  fs.rmSync(root, { recursive: true, force: true });
}

// A denied safety journal must stop before a hook can create an unguarded commit.
{
  const root = gitProject('gps-denied-guard-');
  fs.writeFileSync(path.join(root, 'app.js'), 'ticket edit\n');
  fs.writeFileSync(path.join(root, 'private.txt'), 'user edit\n');
  fs.writeFileSync(path.join(root, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\ngit add private.txt\n', { mode: 0o755 });
  const before = headSha(root);
  const write = fs.writeFileSync;
  let result;
  try {
    fs.writeFileSync = function (file, ...args) {
      if (String(file).includes('gps-unreviewed-commit.json')) throw Object.assign(new Error('journal denied'), { code: 'EACCES' });
      return write.call(this, file, ...args);
    };
    result = commitFiles(root, ['app.js'], 'fix: guarded');
  } finally {
    fs.writeFileSync = write;
  }
  assert.strictEqual(result.ok, false);
  assert.strictEqual(headSha(root), before, 'denied journal must prevent the commit itself');
  fs.rmSync(root, { recursive: true, force: true });
}

// Losing control immediately after git commit leaves the pending review guard.
{
  const root = gitProject('gps-interrupted-guard-');
  fs.writeFileSync(path.join(root, 'app.js'), 'ticket edit\n');
  const cp = require('child_process');
  const execute = cp.execFileSync;
  const modulePath = require.resolve('../../skills/gps/scripts/lib/git');
  const loaded = require.cache[modulePath];
  let result;
  try {
    cp.execFileSync = function (file, args, options) {
      const output = execute(file, args, options);
      if (file === 'git' && args.includes('commit')) throw new Error('interrupted after commit');
      return output;
    };
    delete require.cache[modulePath];
    result = require(modulePath).commitFiles(root, ['app.js'], 'fix: interrupted');
  } finally {
    cp.execFileSync = execute;
    require.cache[modulePath] = loaded;
  }
  assert.strictEqual(result.ok, false);
  assert.strictEqual(fixtureGit(root, 'show', 'HEAD:app.js'), 'ticket edit');
  assert.ok(fs.existsSync(gitPrivatePath(root, 'gps-unreviewed-commit.json')));
  assert.strictEqual(pushBranch(root, 'main').ok, false, 'unverified commit remains blocked');
  fs.rmSync(root, { recursive: true, force: true });
}

// Recovery journals belong to this worktree's private Git directory.
{
  // The long path: git reports it even when the temp dir is an 8.3 short name (RUNNER~1 on CI).
  const root = fs.realpathSync.native(gitProject('gps-private-path-'));
  assert.strictEqual(gitPrivatePath(root, 'gps-finish.json'), path.join(root, '.git', 'gps-finish.json'));
  const linked = path.join(root, 'linked');
  fixtureGit(root, 'worktree', 'add', '-q', '-b', 'fix/linked', linked);
  const linkedJournal = gitPrivatePath(linked, 'gps-finish.json');
  assert.strictEqual(path.basename(linkedJournal), 'gps-finish.json');
  assert.strictEqual(
    fs.realpathSync.native(path.dirname(linkedJournal)),
    fs.realpathSync.native(path.join(root, '.git', 'worktrees', 'linked')),
  );
  fs.rmSync(root, { recursive: true, force: true });
  const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-no-private-path-'));
  assert.strictEqual(gitPrivatePath(plain, 'gps-finish.json'), null);
  fs.rmSync(plain, { recursive: true, force: true });
}

// Every GPS git process trusts only the containing repository for that
// invocation. This keeps direct Node script calls usable from agent sandboxes
// without changing the user's global git config or wrapping the command in a
// host-specific shell environment assignment.
{
  const container = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-safe-dir-'));
  const repo = path.join(container, 'repo with spaces');
  const nestedProject = path.join(repo, 'packages', 'app');
  fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
  fs.mkdirSync(nestedProject, { recursive: true });
  assert.deepStrictEqual(
    safeGitArgs(nestedProject, ['status', '--short']),
    ['-c', `safe.directory=${repo.split(path.sep).join('/')}`, 'status', '--short'],
  );

  const linked = path.join(container, 'linked worktree');
  fs.mkdirSync(linked);
  fs.writeFileSync(path.join(linked, '.git'), 'gitdir: elsewhere\n');
  assert.deepStrictEqual(
    safeGitArgs(linked, ['rev-parse', 'HEAD']),
    ['-c', `safe.directory=${linked.split(path.sep).join('/')}`, 'rev-parse', 'HEAD'],
  );

  const nonRepo = path.join(container, 'not-a-repo');
  fs.mkdirSync(nonRepo);
  assert.deepStrictEqual(safeGitArgs(nonRepo, ['status']), ['status']);
  fs.rmSync(container, { recursive: true, force: true });
}

const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-git-'));
const sessionDir = path.join(projectRoot, '.work', 'sessions', '2026-09-22__test-feature');
fs.mkdirSync(sessionDir, { recursive: true });

// Not a git repo yet -> helpers degrade to empty results, never throw.
assert.deepStrictEqual(readRecentCommits(projectRoot, null), []);
assert.deepStrictEqual(readGitStatusSummary(projectRoot, sessionDir), []);
assert.deepStrictEqual(readGitStatus(projectRoot, sessionDir), { project: [], session: [] });

execSync('git init -q', { cwd: projectRoot, stdio: 'ignore' });
execSync('git config user.email "test@example.com"', { cwd: projectRoot, stdio: 'ignore' });
execSync('git config user.name "Test"', { cwd: projectRoot, stdio: 'ignore' });

// Untracked file inside the session dir shows up as a status entry.
fs.writeFileSync(path.join(sessionDir, 'notes.txt'), 'wip\n');
let statusResult = readGitStatusSummary(projectRoot, sessionDir);
assert.strictEqual(statusResult.length, 1);
assert.strictEqual(statusResult[0].indexStatus, '?');
assert.strictEqual(statusResult[0].worktreeStatus, '?');
assert.ok(statusResult[0].path.endsWith('notes.txt'));

// Commit it -> status goes clean, and the commit shows up in the log.
execSync('git add .', { cwd: projectRoot, stdio: 'ignore' });
execSync('git commit -q -m "add notes"', { cwd: projectRoot, stdio: 'ignore' });

assert.deepStrictEqual(readGitStatusSummary(projectRoot, sessionDir), []);
const log = readRecentCommits(projectRoot, null);
assert.strictEqual(log.length, 1);
assert.ok(log[0].includes('add notes'));

// Commits are project-wide (not limited to the session dir) and filtered by --since.
fs.writeFileSync(path.join(projectRoot, 'code.js'), 'x\n');
execSync('git add code.js', { cwd: projectRoot, stdio: 'ignore' });
execSync('git commit -q -m "code change outside session"', { cwd: projectRoot, stdio: 'ignore' });
assert.strictEqual(readRecentCommits(projectRoot, '2000-01-01T00:00:00.000Z')[0].includes('code change outside session'), true);
assert.deepStrictEqual(readRecentCommits(projectRoot, new Date(Date.now() + 3600 * 1000).toISOString()), []);
assert.strictEqual(readRecentCommits(projectRoot, new Date(Date.now() - 3600 * 1000).toISOString()).length, 2);
assert.strictEqual(readRecentCommits(projectRoot, null, 1).length, 1);

// Paths with shell metacharacters are passed as arguments, never through a shell.
const weirdDir = path.join(projectRoot, '.work', 'sessions', 'x$(touch pwned)`id`');
fs.mkdirSync(weirdDir, { recursive: true });
fs.writeFileSync(path.join(weirdDir, 'f.txt'), 'x\n');
assert.strictEqual(readGitStatusSummary(projectRoot, weirdDir).length, 1);
assert.ok(!fs.existsSync(path.join(projectRoot, 'pwned')));
fs.rmSync(weirdDir, { recursive: true, force: true });

// Modify the tracked file -> shows as modified, not untracked.
fs.writeFileSync(path.join(sessionDir, 'notes.txt'), 'wip again\n');
statusResult = readGitStatusSummary(projectRoot, sessionDir);
assert.strictEqual(statusResult.length, 1);
assert.strictEqual(statusResult[0].indexStatus, ' ');
assert.strictEqual(statusResult[0].worktreeStatus, 'M');

// A change outside the session dir must not leak into the scoped summary.
const outsideDir = path.join(projectRoot, 'other-dir');
fs.mkdirSync(outsideDir, { recursive: true });
fs.writeFileSync(path.join(outsideDir, 'unrelated.txt'), 'noise\n');
statusResult = readGitStatusSummary(projectRoot, sessionDir);
assert.strictEqual(statusResult.length, 1);
assert.ok(statusResult[0].path.endsWith('notes.txt'));

// readGitStatus shows both views separately; the project view leaves gps's
// own .work/ out, tracked or not.
const both = readGitStatus(projectRoot, sessionDir);
assert.strictEqual(both.session.length, 1);
assert.strictEqual(both.project.length, 1);
assert.ok(both.project.every((e) => !e.path.startsWith('.work/')));
assert.ok(both.project.some((e) => e.path.endsWith('unrelated.txt')));

// commitFiles: commits exactly the given files, nothing else that is staged.
fs.writeFileSync(path.join(projectRoot, 'code.js'), 'y\n');
fs.writeFileSync(path.join(projectRoot, 'other.js'), 'staged but not ours\n');
execSync('git add other.js', { cwd: projectRoot, stdio: 'ignore' });
const committed = commitFiles(projectRoot, ['code.js'], 'feat: only code');
assert.strictEqual(committed.ok, true, committed.reason);
assert.deepStrictEqual(committed.files, ['code.js']);
assert.ok(commitExists(projectRoot, committed.sha));
assert.match(describeCommit(projectRoot, committed.sha), /^[0-9a-f]{7,} feat: only code$/);
assert.strictEqual(execSync('git diff --cached --name-only', { cwd: projectRoot, encoding: 'utf-8' }).trim(), 'other.js');
// Nothing to commit, missing paths and non-repos are reported, never thrown.
assert.match(commitFiles(projectRoot, ['code.js'], 'again').reason, /has changes to commit/);
assert.strictEqual(commitFiles(projectRoot, ['nope.js'], 'x').ok, false);
assert.strictEqual(commitExists(projectRoot, 'deadbeef'), false);
assert.strictEqual(describeCommit(projectRoot, 'deadbeef'), null);
// A git that cannot inspect the repository is not "commit absent": commitExists
// says so instead of reporting the commit missing.
{
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-exists-norepo-'));
  assert.throws(() => commitExists(bare, committed.sha), /git could not inspect the repository/);
}
// commitFiles with a tracked file deleted from disk: committed as a deletion
// with a pathspec (nothing else staged goes in), even under an ignored
// directory; restoreFromHead puts files back after a failed commit.
{
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-rm-'));
  const g = (cmd) => execSync(cmd, { cwd: r, encoding: 'utf-8' }).trim();
  g('git init -q -b main && git config user.email t@e && git config user.name T && git config core.autocrlf false');
  fs.mkdirSync(path.join(r, 'w'));
  fs.writeFileSync(path.join(r, '.gitignore'), 'w/\n');
  fs.writeFileSync(path.join(r, 'w', 'frag.md'), 'f\n');
  fs.writeFileSync(path.join(r, 'log.md'), 'a\n');
  g('git add .gitignore log.md && git add -f w/frag.md && git commit -q -m init');
  fs.writeFileSync(path.join(r, 'log.md'), 'b\n');
  fs.writeFileSync(path.join(r, 'stray.js'), 's\n');
  g('git add stray.js');
  fs.rmSync(path.join(r, 'w', 'frag.md'));
  // A failing hook: nothing committed; the by-hand commands git rm the deleted file.
  const hook = path.join(r, '.git', 'hooks', 'pre-commit');
  fs.writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const failed = commitFiles(r, ['log.md', 'w/frag.md'], 'rel');
  assert.strictEqual(failed.ok, false);
  assert.deepStrictEqual(failed.commands, ['git add -- "log.md"', 'git rm -q -- "w/frag.md"', 'git commit -m "rel" -- "log.md" "w/frag.md"']);
  fs.unlinkSync(hook);
  const retry = commitFiles(r, ['log.md', 'w/frag.md'], 'rel');
  assert.strictEqual(retry.ok, true, 'retry must accept the deletion already staged by the failed commit');
  assert.deepStrictEqual(g('git show --name-status --format= HEAD').split('\n').sort(), ['D\tw/frag.md', 'M\tlog.md']);
  g('git reset -q HEAD~1');
  g('git add stray.js');
  fs.writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  assert.deepStrictEqual(restoreFromHead(r, ['w/frag.md']), { ok: true });
  assert.ok(fs.existsSync(path.join(r, 'w', 'frag.md')), 'back on disk');
  assert.strictEqual(g('git status --porcelain -- w'), '', 'and in the index as in HEAD');
  assert.strictEqual(restoreFromHead(r, ['nope.md']).ok, false);
  assert.deepStrictEqual(restoreFromHead(r, []), { ok: true });
  fs.unlinkSync(hook);
  fs.rmSync(path.join(r, 'w', 'frag.md'));
  const res = commitFiles(r, ['log.md', 'w/frag.md'], 'rel');
  assert.strictEqual(res.ok, true, res.reason);
  assert.deepStrictEqual(g('git show --name-status --format= HEAD').split('\n').sort(), ['D\tw/frag.md', 'M\tlog.md']);
  assert.strictEqual(g('git status --porcelain'), 'A  stray.js', 'the stray staged file stays out');
  assert.strictEqual(g('git log -1 --format=%s'), 'rel');
  fs.rmSync(r, { recursive: true, force: true });
}

const notRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-norepo-'));
assert.strictEqual(commitFiles(notRepo, ['a'], 'x').reason, 'not a git repository');
fs.rmSync(notRepo, { recursive: true, force: true });

fs.rmSync(projectRoot, { recursive: true, force: true });
// Finish cannot know who owns leftover edits: refuse without changing the index.
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-leftovers-'));
  const sh = (cmd) => execSync(cmd, { cwd: root, encoding: 'utf-8' }).trim();
  sh('git init -q -b main');
  sh('git config user.email test@example.com');
  sh('git config user.name Test');
  fs.writeFileSync(path.join(root, 'tracked.txt'), 'old\n');
  fs.writeFileSync(path.join(root, 'deleted.txt'), 'old\n');
  sh('git add tracked.txt deleted.txt');
  sh('git commit -q -m initial');
  fs.writeFileSync(path.join(root, 'tracked.txt'), 'new\n');
  fs.unlinkSync(path.join(root, 'deleted.txt'));
  fs.writeFileSync(path.join(root, 'new.txt'), 'new\n');
  fs.mkdirSync(path.join(root, '.work', 'other'), { recursive: true });
  fs.writeFileSync(path.join(root, '.work', 'other', 'state'), 'foreign\n');
  sh('git add new.txt .work/other/state');
  fs.appendFileSync(path.join(root, 'new.txt'), 'unstaged\n');
  sh('git add tracked.txt');
  fs.appendFileSync(path.join(root, 'tracked.txt'), 'user unstaged\n');
  const beforeHead = sh('git rev-parse HEAD');
  const beforeIndex = sh('git diff --cached --binary');
  const beforeTree = sh('git diff --binary');
  const result = commitRemainingChanges(root, 'remaining');
  assert.strictEqual(result.ok, false, 'leftovers need explicit ownership before committing');
  assert.deepStrictEqual(result.files.sort(), ['deleted.txt', 'tracked.txt']);
  assert.strictEqual(sh('git rev-parse HEAD'), beforeHead);
  assert.strictEqual(sh('git diff --cached --binary'), beforeIndex, 'partial staging is preserved');
  assert.strictEqual(sh('git diff --binary'), beforeTree);
  assert.strictEqual(sh('git show :new.txt'), 'new', 'the staged addition was not updated');
  assert.match(sh('git status --porcelain -- new.txt'), /^AM/);
  sh('git restore --source=HEAD --staged --worktree tracked.txt deleted.txt');
  assert.strictEqual(commitRemainingChanges(root, 'nothing').sha, null, 'staged additions alone do not create a commit');
  assert.strictEqual(sh('git show :new.txt'), 'new');
  fs.rmSync(root, { recursive: true, force: true });
}

// File arguments are literal, individual files, never broad git pathspecs.
for (const requested of ['*.js', '.', null]) {
  const root = gitProject('gps-literal-file-');
  fs.writeFileSync(path.join(root, 'app.js'), 'ticket edit\n');
  fs.writeFileSync(path.join(root, 'private.js'), 'user edit\n');
  fixtureGit(root, 'add', 'private.js');
  const before = fixtureGit(root, 'diff', '--cached', '--binary');
  const head = headSha(root);
  const result = commitFiles(root, requested === null ? [] : [requested], 'fix: scoped');
  assert.strictEqual(result.ok, false, `${requested} must not select unrelated files`);
  assert.strictEqual(headSha(root), head);
  assert.strictEqual(fixtureGit(root, 'diff', '--cached', '--binary'), before);
  fs.rmSync(root, { recursive: true, force: true });
}

// Equivalent path spellings share the same scope and must not create a guard.
for (const spelling of ['dot', 'native', 'absolute']) {
  const root = gitProject('gps-file-spelling-');
  const folder = path.join(root, 'nested');
  fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, 'app.js'), 'ticket edit\n');
  const requested = spelling === 'dot' ? './nested/app.js'
    : spelling === 'native' ? path.join('nested', 'app.js') : path.join(folder, 'app.js');
  const result = commitFiles(root, [requested], 'fix: canonical path');
  assert.strictEqual(result.ok, true, result.reason);
  assert.deepStrictEqual(result.files, ['nested/app.js']);
  assert.strictEqual(fs.existsSync(gitPrivatePath(root, 'gps-unreviewed-commit.json')), false);
  fs.rmSync(root, { recursive: true, force: true });
}

// A literal filename containing glob syntax must not select a similarly named file.
{
  const root = gitProject('gps-bracket-file-');
  fs.writeFileSync(path.join(root, 'file[1].js'), 'ticket edit\n');
  fs.writeFileSync(path.join(root, 'file1.js'), 'user edit\n');
  const result = commitFiles(root, ['file[1].js'], 'fix: literal');
  assert.strictEqual(result.ok, true, result.reason);
  assert.deepStrictEqual(result.files, ['file[1].js']);
  assert.strictEqual(fixtureGit(root, 'ls-files', 'file1.js'), '');
  fs.rmSync(root, { recursive: true, force: true });
}

// A partial staged edit is a user-selected boundary, including after a failed hook.
{
  const root = gitProject('gps-partial-file-');
  fs.writeFileSync(path.join(root, 'app.js'), 'staged user edit\n');
  fixtureGit(root, 'add', 'app.js');
  fs.appendFileSync(path.join(root, 'app.js'), 'unstaged ticket edit\n');
  const before = fixtureGit(root, 'diff', '--cached', '--binary');
  const result = commitFiles(root, ['app.js'], 'fix: scoped');
  assert.strictEqual(result.ok, false, 'partial staging must not be overwritten');
  assert.match(result.reason, /partially staged/i);
  assert.strictEqual(fixtureGit(root, 'diff', '--cached', '--binary'), before);
  assert.match(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), /unstaged ticket edit/);
  fs.rmSync(root, { recursive: true, force: true });
}

// Record renames include both paths in the scope check, without false alarms.
{
  const root = gitProject('gps-record-rename-');
  const folder = path.join(root, '.work', 'sessions');
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'old.md'), 'session record\n');
  assert.strictEqual(commitWorkDir(root, 'chore(gps): initial').ok, true);
  fs.renameSync(path.join(folder, 'old.md'), path.join(folder, 'new.md'));
  const renamed = commitWorkDir(root, 'chore(gps): rename');
  assert.strictEqual(renamed.ok, true, renamed.reason);
  assert.deepStrictEqual(renamed.files.sort(), ['.work/sessions/new.md', '.work/sessions/old.md']);
  fs.rmSync(root, { recursive: true, force: true });
}

// Record commits must detect the same hook scope escape without rewriting history.
{
  const root = gitProject('gps-record-hook-scope-');
  fs.mkdirSync(path.join(root, '.work', 'sessions'), { recursive: true });
  fs.writeFileSync(path.join(root, '.work', 'sessions', 'record.md'), 'record\n');
  fs.writeFileSync(path.join(root, 'private.txt'), 'user edit\n');
  fs.writeFileSync(path.join(root, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\ngit add private.txt\n', { mode: 0o755 });
  const result = commitWorkDir(root, 'chore(gps): record');
  assert.strictEqual(result.ok, false);
  assert.ok(result.sha);
  assert.deepStrictEqual(result.files.sort(), ['.work/sessions/record.md', 'private.txt']);
  assert.match(result.reason, /outside.*scope|unexpected/i);
  fs.rmSync(root, { recursive: true, force: true });
}

// Hooks may stage additional paths; report the actual commit and refuse success.
{
  const root = gitProject('gps-hook-scope-');
  fs.writeFileSync(path.join(root, 'app.js'), 'ticket edit\n');
  fs.writeFileSync(path.join(root, 'private.txt'), 'user edit\n');
  fs.writeFileSync(path.join(root, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\ngit add private.txt\n', { mode: 0o755 });
  const result = commitFiles(root, ['app.js'], 'fix: scoped');
  assert.strictEqual(result.ok, false, 'unexpected hook-staged files require review');
  assert.ok(result.sha, 'preserve and identify the commit instead of resetting it');
  assert.deepStrictEqual(result.files.sort(), ['app.js', 'private.txt']);
  assert.match(result.reason, /outside.*scope|unexpected/i);
  assert.strictEqual(fixtureGit(root, 'show', 'HEAD:private.txt'), 'user edit');
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-hook-publish-'));
  fixtureGit(bare, 'init', '--bare', '-q');
  fixtureGit(root, 'remote', 'add', 'origin', bare);
  fs.unlinkSync(path.join(root, '.git', 'hooks', 'pre-commit'));
  assert.strictEqual(commitWorkDir(root, 'chore(gps): retry').ok, true, 'a later no-op cannot clear the publication block');
  assert.strictEqual(pushBranch(root, 'main').ok, false, 'retry must not publish the unexpected commit');
  assert.strictEqual(remoteBranchAt(root, 'main'), null);
  fixtureGit(root, 'tag', '-a', 'v1.0.0', '-m', 'fixture');
  assert.strictEqual(pushWithTags(root, 'main').ok, false, 'release push must honor the same review requirement');
  assert.strictEqual(remoteHasTag(root, 'v1.0.0'), false);
  const marker = gitPrivatePath(root, 'gps-unreviewed-commit.json');
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(marker, 'utf8')).files, ['private.txt']);
  fs.writeFileSync(marker, '{interrupted');
  assert.strictEqual(pushBranch(root, 'main').ok, false, 'malformed marker must also fail closed');
  fs.unlinkSync(marker); // Simulate explicit review and acknowledgement by the user.
  assert.strictEqual(pushBranch(root, 'main').ok, true);
  assert.strictEqual(remoteBranchAt(root, 'main'), headSha(root));
  fs.rmSync(bare, { recursive: true, force: true });
  fs.rmSync(root, { recursive: true, force: true });
}
// isIgnored: a blank line of a CRLF ignore file becomes an empty pattern that
// git matches against any path ending in "/"; it must not read as ".work/ ignored".
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-crlf-'));
  const sh = (cmd) => execSync(cmd, { cwd: root, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  sh('git init -q -b main');
  const excludes = path.join(root, '..', `gps-crlf-excludes-${path.basename(root)}`);
  fs.writeFileSync(excludes, '*.log\r\n\r\nlogs/\r\n');
  sh(`git config core.excludesfile "${excludes.replace(/\\/g, '/')}"`);
  assert.strictEqual(isIgnored(root, '.work/'), false, 'a CRLF blank line does not ignore .work/');
  fs.writeFileSync(excludes, '.work/\r\n');
  assert.strictEqual(isIgnored(root, '.work/'), true, 'a real .work/ line still counts');
  fs.writeFileSync(path.join(root, '.gitignore'), '');
  fs.writeFileSync(excludes, '');
  fs.writeFileSync(path.join(root, '.gitignore'), '.work\n');
  assert.strictEqual(isIgnored(root, '.work/'), true, 'the slashless form counts too');
  fs.rmSync(excludes, { force: true });
  fs.rmSync(root, { recursive: true, force: true });
}
// commitWorkDir: .work/ in its own commit; other staged files stay staged,
// a path the user git-ignores stays out.
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-workdir-'));
  assert.deepStrictEqual(commitWorkDir(root, 'm'), { ok: true, sha: null, files: [], skipped: 'not a git repository' });
  const sh = (cmd) => execSync(cmd, { cwd: root, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  sh('git init -q -b main');
  sh('git config user.email "test@example.com"');
  sh('git config user.name "Test"');
  fs.writeFileSync(path.join(root, 'app.js'), '1\n');
  sh('git add app.js');
  sh('git commit -q -m initial');
  assert.deepStrictEqual(commitWorkDir(root, 'm'), { ok: true, sha: null, files: [], skipped: null }, 'no .work/ yet');

  fs.mkdirSync(path.join(root, '.work', 'sessions', 's1'), { recursive: true });
  fs.writeFileSync(path.join(root, '.work', 'sessions', 's1', 'plan.md'), 'plan\n');
  fs.writeFileSync(path.join(root, '.work', 'sessions', '.current-session'), 's1');
  fs.writeFileSync(path.join(root, '.gitignore'), '.work/sessions/.current-session\n');
  fs.writeFileSync(path.join(root, 'app.js'), '2\n');
  sh('git add app.js');
  const record = commitWorkDir(root, 'chore(gps): plan s1');
  assert.ok(record.ok && record.sha);
  assert.deepStrictEqual(record.files, ['.work/sessions/s1/plan.md']);
  assert.strictEqual(sh('git log -1 --format=%s'), 'chore(gps): plan s1');
  assert.strictEqual(sh('git diff --cached --name-only'), 'app.js', 'other staged files stay staged');
  assert.match(describeWorkCommit(record).line, /Session record committed \([0-9a-f]+\): 1 file\(s\) in \.work\//);
  assert.deepStrictEqual(commitWorkDir(root, 'm'), { ok: true, sha: null, files: [], skipped: null }, 'nothing new');
  assert.deepStrictEqual(describeWorkCommit(commitWorkDir(root, 'm')), { line: null, warning: null });

  // branchesHolding finds the branch a path was committed on.
  assert.deepStrictEqual(branchesHolding(root, '.work/sessions/s1/plan.md'), ['main']);
  assert.deepStrictEqual(branchesHolding(root, '.work/sessions/nope/plan.md'), []);

  // A git-ignored .work/ (older gps) is skipped with a warning, never forced in.
  fs.writeFileSync(path.join(root, '.gitignore'), '.work/\n');
  assert.ok(isIgnored(root, '.work/'));
  fs.writeFileSync(path.join(root, '.work', 'sessions', 's1', 'more.md'), 'x\n');
  const skipped = commitWorkDir(root, 'm');
  assert.deepStrictEqual(skipped, { ok: true, sha: null, files: [], skipped: '.work/ is git-ignored' });
  assert.match(describeWorkCommit(skipped).warning, /\.work\/ is git-ignored/);

  // A failed commit (pre-commit hook) is reported with the commands to run.
  fs.writeFileSync(path.join(root, '.gitignore'), '');
  fs.writeFileSync(path.join(root, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\necho "lint failed" >&2\nexit 1\n', { mode: 0o755 });
  const failed = commitWorkDir(root, 'm');
  assert.strictEqual(failed.ok, false);
  assert.strictEqual(failed.reason, 'lint failed');
  assert.match(describeWorkCommit(failed).warning, /not committed \(lint failed\)\. Run by hand: git add -- \.work\/sessions && git commit/);
}

// commitWorkDir commits only GPS_WORK_PATHS: other skills' files under .work/
// stay out (docs/WORK-DIR.md).
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-workpaths-'));
  const sh = (cmd) => execSync(cmd, { cwd: root, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  sh('git init -q -b main');
  sh('git config user.email "test@example.com"');
  sh('git config user.name "Test"');
  fs.writeFileSync(path.join(root, 'app.js'), '1\n');
  fs.writeFileSync(path.join(root, '.gitignore'), '.work/sessions/.current-session\n');
  sh('git add app.js .gitignore');
  sh('git commit -q -m initial');
  assert.deepStrictEqual(GPS_WORK_PATHS, ['.work/gps-config.json', '.work/GLOSSARY.md', '.work/adr', '.work/sessions', '.work/changelog']);

  // sessions/ holds only an ignored file: the config alone is committed.
  fs.mkdirSync(path.join(root, '.work', 'sessions'), { recursive: true });
  fs.writeFileSync(path.join(root, '.work', 'sessions', '.current-session'), 's1');
  fs.writeFileSync(path.join(root, '.work', 'gps-config.json'), '{}\n');
  let record = commitWorkDir(root, 'chore(gps): config');
  assert.ok(record.ok && record.sha, JSON.stringify(record));
  assert.deepStrictEqual(record.files, ['.work/gps-config.json']);

  // Nothing outside GPS_WORK_PATHS is committed; a staged foreign file stays staged.
  fs.mkdirSync(path.join(root, '.work', 'other-skill'), { recursive: true });
  fs.writeFileSync(path.join(root, '.work', 'other-skill', 'state.md'), 'x\n');
  fs.writeFileSync(path.join(root, '.work', 'notes.md'), 'x\n');
  fs.writeFileSync(path.join(root, '.work', 'other-skill', 'staged.md'), 'x\n');
  sh('git add .work/other-skill/staged.md');
  fs.mkdirSync(path.join(root, '.work', 'sessions', 's1'), { recursive: true });
  fs.writeFileSync(path.join(root, '.work', 'sessions', 's1', 'plan.md'), 'plan\n');
  fs.writeFileSync(path.join(root, '.work', 'GLOSSARY.md'), 'terms\n');
  record = commitWorkDir(root, 'chore(gps): plan s1');
  assert.ok(record.ok, JSON.stringify(record));
  assert.deepStrictEqual(record.files.sort(), ['.work/GLOSSARY.md', '.work/sessions/s1/plan.md']);
  assert.strictEqual(sh('git diff --cached --name-only'), '.work/other-skill/staged.md', 'a staged foreign file stays staged');
  assert.match(sh('git status --porcelain'), /\?\? \.work\/notes\.md/);
  assert.match(sh('git status --porcelain'), /\?\? \.work\/other-skill\/state\.md/);
  sh('git reset -q');

  // Deleting a tracked gps file (and a whole session) is committed.
  fs.rmSync(path.join(root, '.work', 'GLOSSARY.md'));
  fs.rmSync(path.join(root, '.work', 'sessions', 's1'), { recursive: true });
  record = commitWorkDir(root, 'chore(gps): clean');
  assert.ok(record.ok, JSON.stringify(record));
  assert.deepStrictEqual(record.files.sort(), ['.work/GLOSSARY.md', '.work/sessions/s1/plan.md']);
  assert.strictEqual(sh('git ls-files .work/GLOSSARY.md .work/sessions'), '');

  // A git-ignored owned path is skipped; the others still commit.
  fs.appendFileSync(path.join(root, '.gitignore'), '.work/adr/\n');
  fs.mkdirSync(path.join(root, '.work', 'adr'), { recursive: true });
  fs.writeFileSync(path.join(root, '.work', 'adr', '0001-x.md'), 'adr\n');
  fs.writeFileSync(path.join(root, '.work', 'gps-config.json'), '{"a":1}\n');
  record = commitWorkDir(root, 'chore(gps): ignored adr');
  assert.ok(record.ok, JSON.stringify(record));
  assert.deepStrictEqual(record.files, ['.work/gps-config.json']);

  // A tracked folder the user then git-ignores: its tracked changes still
  // commit, and the other owned paths are not blocked by it.
  fs.writeFileSync(path.join(root, '.gitignore'), '.work/sessions/.current-session\n');
  assert.deepStrictEqual(commitWorkDir(root, 'chore(gps): adr').files, ['.work/adr/0001-x.md']);
  fs.writeFileSync(path.join(root, '.gitignore'), '.work/sessions/.current-session\n.work/adr/\n');
  sh('git add .gitignore');
  sh('git commit -q -m "ignore adr"');
  fs.writeFileSync(path.join(root, '.work', 'gps-config.json'), '{"a":2}\n');
  fs.writeFileSync(path.join(root, '.work', 'adr', '0001-x.md'), 'adr v2\n');
  record = commitWorkDir(root, 'chore(gps): tracked ignored adr');
  assert.ok(record.ok, JSON.stringify(record));
  assert.deepStrictEqual(record.files.sort(), ['.work/adr/0001-x.md', '.work/gps-config.json']);
  fs.rmSync(root, { recursive: true, force: true });
}

// commitWorkDir commits the session pointer, the seeds file and the write
// payloads when .gitignore no longer ignores them.
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-state-'));
  const sh = (cmd) => execSync(cmd, { cwd: root, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  sh('git init -q -b main');
  sh('git config user.email "test@example.com"');
  sh('git config user.name "Test"');
  fs.writeFileSync(path.join(root, 'app.js'), '1\n');
  fs.writeFileSync(path.join(root, '.gitignore'), '.scratch/\n');
  sh('git add app.js .gitignore');
  sh('git commit -q -m initial');
  const sessions = path.join(root, '.work', 'sessions');
  fs.mkdirSync(path.join(sessions, 's1'), { recursive: true });
  fs.writeFileSync(path.join(sessions, '.current-session'), 's1');
  fs.writeFileSync(path.join(sessions, '.pending-seeds.json'), '{}\n');
  fs.writeFileSync(path.join(sessions, 's1', '.write-payload.md'), 'write\n');
  fs.writeFileSync(path.join(sessions, 's1', '.changelog-payload.md'), 'changelog\n');
  const record = commitWorkDir(root, 'chore(gps): state');
  assert.ok(record.ok && record.sha, JSON.stringify(record));
  assert.deepStrictEqual(record.files.sort(), [
    '.work/sessions/.current-session',
    '.work/sessions/.pending-seeds.json',
    '.work/sessions/s1/.changelog-payload.md',
    '.work/sessions/s1/.write-payload.md',
  ]);
  assert.strictEqual(sh('git status --porcelain'), '', 'nothing is left uncommitted');
  fs.rmSync(root, { recursive: true, force: true });
}

// A project in a subfolder of its repo: only its own .work/ files are
// committed, never the user's staged code.
{
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-subdir-'));
  const root = path.join(repoRoot, 'sub');
  const sh = (cmd) => execSync(cmd, { cwd: repoRoot, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  sh('git init -q -b main');
  sh('git config user.email "test@example.com"');
  sh('git config user.name "Test"');
  fs.mkdirSync(path.join(root, '.work', 'sessions', 's1'), { recursive: true });
  fs.writeFileSync(path.join(root, 'app.js'), '1\n');
  sh('git add sub/app.js');
  sh('git commit -q -m initial');
  fs.writeFileSync(path.join(root, 'app.js'), '2\n');
  sh('git add sub/app.js');
  fs.writeFileSync(path.join(root, '.work', 'sessions', 's1', 'plan.md'), 'plan\n');
  const record = commitWorkDir(root, 'chore(gps): plan s1');
  assert.ok(record.ok && record.sha, JSON.stringify(record));
  assert.deepStrictEqual(record.files, ['.work/sessions/s1/plan.md']);
  assert.strictEqual(sh('git show --name-only --format= HEAD'), 'sub/.work/sessions/s1/plan.md');
  assert.strictEqual(sh('git diff --cached --name-only'), 'sub/app.js', 'the user\'s staged code stays staged');
  fs.rmSync(repoRoot, { recursive: true, force: true });
}

// Release helpers: messages, default branch, tags and push with tags.
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-rel-'));
  const bare = path.join(root, 'origin.git');
  const repo = path.join(root, 'repo');
  fs.mkdirSync(repo);
  const sh = (cwd, cmd) => execSync(cmd, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  sh(root, `git init -q --bare "${bare}"`);
  sh(repo, 'git init -q -b main');
  sh(repo, 'git config user.email "test@example.com"');
  sh(repo, 'git config user.name "Test"');
  assert.deepStrictEqual(commitMessages(repo, { since: 0 }), [], 'no commit yet');
  assert.strictEqual(headCommit(repo), null);
  fs.writeFileSync(path.join(repo, 'a.txt'), '1\n');
  sh(repo, 'git add a.txt');
  sh(repo, 'git commit -q -m initial');
  assert.strictEqual(defaultBranch(repo), 'main', 'local main, no origin/HEAD');
  assert.strictEqual(defaultBranch(root), null, 'not a repo');
  sh(repo, 'git switch -q -c feat/x');
  fs.writeFileSync(path.join(repo, 'a.txt'), '2\n');
  sh(repo, 'git add a.txt');
  execSync('git commit -q -F -', { cwd: repo, input: 'feat!: drop v1\n\nBREAKING CHANGE: v1 is gone\n', stdio: ['pipe', 'ignore', 'ignore'] });
  fs.writeFileSync(path.join(repo, 'a.txt'), '3\n');
  sh(repo, 'git commit -q -am "fix: typo"');
  const msgs = commitMessages(repo, { base: 'main', branch: 'feat/x' });
  assert.strictEqual(msgs.length, 2);
  assert.strictEqual(msgs[0], 'fix: typo', 'newest first, trimmed');
  assert.match(msgs[1], /BREAKING CHANGE: v1 is gone$/);
  assert.strictEqual(commitMessages(repo, { since: Math.floor(Date.now() / 1000) - 3600 }).length, 3);
  assert.deepStrictEqual(commitMessages(repo, { since: Math.floor(Date.now() / 1000) + 3600 }), []);
  assert.deepStrictEqual(commitMessages(repo, { base: 'nope', branch: 'feat/x' }), []);

  assert.strictEqual(isCleanTree(repo), true);
  fs.writeFileSync(path.join(repo, 'new.txt'), 'x\n');
  assert.strictEqual(isCleanTree(repo), false, 'untracked counts');
  fs.rmSync(path.join(repo, 'new.txt'));
  assert.strictEqual(isCleanTree(root), false, 'not a repo');

  sh(repo, `git remote add origin "${bare}"`);
  assert.strictEqual(tagExists(repo, 'v1.0.0'), false);
  assert.strictEqual(remoteHasTag(repo, 'v1.0.0'), false);
  assert.deepStrictEqual(headCommit(repo).tags, []);
  assert.deepStrictEqual(createTag(repo, 'v1.0.0', 'Release 1.0.0'), { ok: true });
  assert.strictEqual(tagExists(repo, 'v1.0.0'), true);
  assert.strictEqual(sh(repo, 'git cat-file -t v1.0.0'), 'tag', 'annotated');
  const dup = createTag(repo, 'v1.0.0', 'again');
  assert.strictEqual(dup.ok, false);
  assert.match(dup.commands[0], /^git tag -a v1\.0\.0 -m /);
  const head = headCommit(repo);
  assert.strictEqual(head.subject, 'fix: typo');
  assert.strictEqual(head.body, '');
  assert.deepStrictEqual(head.tags, ['v1.0.0']);

  const pushed = pushWithTags(repo, 'feat/x');
  assert.strictEqual(pushed.ok, true, JSON.stringify(pushed));
  assert.deepStrictEqual(pushed.commands, ['git push --atomic --follow-tags origin feat/x']);
  assert.strictEqual(remoteHasTag(repo, 'v1.0.0'), true);
  assert.strictEqual(remoteHasTag(repo, 'v1.0'), false, 'exact tag name only');
  assert.strictEqual(remoteBranchAt(repo, 'feat/x'), headSha(repo));
  assert.strictEqual(remoteBranchAt(repo, 'nope'), null);
  // fetchBehind: fetches origin's branch, counts the commits HEAD lacks.
  assert.deepStrictEqual(fetchBehind(repo, 'feat/x'), { ok: true, behind: 0 });
  fs.writeFileSync(path.join(repo, 'ahead.txt'), 'x\n');
  sh(repo, 'git add ahead.txt');
  sh(repo, 'git commit -q -m "chore: ahead"');
  sh(repo, 'git push -q origin feat/x');
  sh(repo, 'git reset -q --hard HEAD~1');
  sh(repo, 'git update-ref -d refs/remotes/origin/feat/x');
  assert.deepStrictEqual(fetchBehind(repo, 'feat/x'), { ok: true, behind: 1 }, 'the fetch brings the new commit');
  sh(repo, 'git merge -q --ff-only origin/feat/x');
  const missing = fetchBehind(repo, 'no-such-branch');
  assert.strictEqual(missing.ok, false);
  assert.ok(missing.reason);
  assert.deepStrictEqual(fetchBehind(root, 'main'), { ok: false, reason: 'no origin remote' });
  const badPush = pushWithTags(repo, 'missing-branch');
  assert.strictEqual(badPush.ok, false);
  assert.ok(badPush.reason && badPush.commands.length === 1);
  assert.strictEqual(createTag(root, 'v2', 'x').ok, false, 'not a repo');
  fs.rmSync(root, { recursive: true, force: true });
}

// failureReason keeps git's last stderr line, except for the dubious-ownership
// refusal, whose last line (a `git config` suggestion) would mislead.
assert.strictEqual(failureReason({ stderr: 'fatal: not a git repository\n' }), 'fatal: not a git repository');
const dubious = failureReason({
  stderr: "fatal: detected dubious ownership in repository at 'C:/x'\nTo add an exception for this directory, call:\n\n\tgit config --global --add safe.directory C:/x\n",
});
assert.ok(/another user/.test(dubious) && /outside the sandbox/.test(dubious));
assert.ok(!/safe\.directory C:/.test(dubious), 'the misleading suggestion is not echoed');

console.log('git.test.js: all assertions passed');
