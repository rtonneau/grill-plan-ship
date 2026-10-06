// tests/lib/git.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const {
  readRecentCommits, readGitStatus, commitFiles, restoreFromHead, commitExists, describeCommit,
  commitWorkDir, describeWorkCommit, branchesHolding, isIgnored, GPS_WORK_PATHS,
  commitMessages, defaultBranch, isCleanTree, tagExists, createTag, headCommit, pushWithTags, remoteHasTag, remoteBranchAt, headSha, fetchBehind,
} = require('../../skills/gps/scripts/lib/git');

const readGitStatusSummary = (root, dir) => readGitStatus(root, dir).session;

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
// commitWorkDir: .work/ in its own commit; other staged files stay staged,
// git-ignored per-machine files stay out.
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

console.log('git.test.js: all assertions passed');
