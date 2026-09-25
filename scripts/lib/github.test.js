// scripts/lib/github.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  isGithubUrl, detectGithub, currentBranch, validateBranchName, createSessionBranch,
  branchType, commitsBetween, hasUncommittedChanges, openPullRequest,
  ghAuthenticated, createIssue, commentOnIssue, closeIssue, buildIssueBody,
} = require('./github');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-github-'));
const repo = path.join(tmp, 'repo');
const bare = path.join(tmp, 'origin.git');
fs.mkdirSync(repo);

function git(...args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

// URL detection.
for (const url of [
  'https://github.com/acme/app.git',
  'https://token@github.com/acme/app',
  'git@github.com:acme/app.git',
  'ssh://git@github.com/acme/app.git',
]) assert.strictEqual(isGithubUrl(url), true, url);
for (const url of [null, '', 'https://gitlab.com/acme/app.git', 'https://github.com.evil.io/x', 'git@bitbucket.org:a/b.git']) {
  assert.strictEqual(isGithubUrl(url), false, String(url));
}

// Not a repo -> off.
assert.strictEqual(detectGithub(repo), false);

git('init', '-q', '-b', 'main');
git('config', 'user.email', 't@example.com');
git('config', 'user.name', 'T');
fs.writeFileSync(path.join(repo, 'app.js'), '1\n');
git('add', 'app.js');
git('commit', '-q', '-m', 'initial');

// Repo without origin, then non-GitHub origin -> off; GitHub origin -> on.
assert.strictEqual(detectGithub(repo), false);
git('remote', 'add', 'origin', 'https://gitlab.com/acme/app.git');
assert.strictEqual(detectGithub(repo), false);
git('remote', 'set-url', 'origin', 'https://github.com/acme/app.git');
assert.strictEqual(detectGithub(repo), true);
// Pushes really go to a local bare repo; detection still sees github.com.
execFileSync('git', ['init', '-q', '--bare', bare], { stdio: 'ignore' });
git('config', `url.${bare.replace(/\\/g, '/')}.insteadOf`, 'https://github.com/acme/app.git');
assert.strictEqual(detectGithub(repo), true);

// Branch name validation.
assert.deepStrictEqual(validateBranchName(repo, 'feat/dark-mode-toggle'), []);
assert.deepStrictEqual(validateBranchName(repo, 'fix/null.path_v2'), []);
assert.match(validateBranchName(repo, '')[0], /Missing field "\*\*Branch:\*\*"/);
for (const bad of ['dark-mode', 'feature/x', 'feat/Dark', 'feat/a--b', 'feat/-a', 'feat/a/b', `feat/${'a'.repeat(80)}`]) {
  assert.strictEqual(validateBranchName(repo, bad).length, 1, bad);
}
assert.match(validateBranchName(repo, 'feat/x; rm -rf /')[0], /must look like/);
git('branch', 'feat/taken');
assert.match(validateBranchName(repo, 'feat/taken')[0], /already exists/);

// Create from HEAD: base recorded, uncommitted changes carried over.
fs.writeFileSync(path.join(repo, 'app.js'), '2\n');
const info = createSessionBranch(repo, 'feat/dark-mode');
assert.strictEqual(info.branch, 'feat/dark-mode');
assert.strictEqual(info.base_branch, 'main');
assert.strictEqual(info.pr_url, null);
assert.ok(!Number.isNaN(Date.parse(info.branch_created_at)));
assert.strictEqual(currentBranch(repo), 'feat/dark-mode');
assert.strictEqual(fs.readFileSync(path.join(repo, 'app.js'), 'utf-8'), '2\n');
assert.strictEqual(hasUncommittedChanges(repo), true);
assert.throws(() => createSessionBranch(repo, 'feat/taken'), /git switch -c feat\/taken failed/);

git('commit', '-q', '-am', 'feat: two');
assert.strictEqual(hasUncommittedChanges(repo), false);
assert.strictEqual(branchType(info.branch), 'feat');
const commits = commitsBetween(repo, 'main', 'feat/dark-mode');
assert.strictEqual(commits.length, 1);
assert.match(commits[0], /feat: two/);

// Detached HEAD is refused.
git('switch', '-q', '--detach');
assert.match(validateBranchName(repo, 'feat/other').pop(), /HEAD is detached/);
git('switch', '-q', 'feat/dark-mode');

// openPullRequest with a stub gh: every call is appended to ghLog;
// "pr list" prints GH_STUB_OPEN_PR (an already-open PR) when set.
const ghLog = path.join(tmp, 'gh-calls.jsonl');
const ghStub = path.join(tmp, 'gh-stub.js');
fs.writeFileSync(ghStub, `
const fs = require('fs');
const args = process.argv.slice(2);
const bodyAt = args.indexOf('--body-file');
const body = bodyAt >= 0 ? fs.readFileSync(args[bodyAt + 1], 'utf-8') : null;
fs.appendFileSync(${JSON.stringify(ghLog)}, JSON.stringify({ args, body }) + '\\n');
if (process.env.GH_STUB_FAIL) { console.error('gh: not logged in'); process.exit(1); }
if (args[0] === 'auth') process.exit(0);
if (args[0] === 'issue' && args[1] === 'create') {
  console.log(process.env.GH_STUB_NO_URL ? 'created' : 'https://github.com/acme/app/issues/5');
  process.exit(0);
}
if (args[0] === 'issue') process.exit(0);
if (args[1] === 'list') { if (process.env.GH_STUB_OPEN_PR) console.log(process.env.GH_STUB_OPEN_PR); process.exit(0); }
console.log('Creating pull request...');
console.log('https://github.com/acme/app/pull/7');
`);
process.env.GPS_GH_BIN = ghStub;
const ghCalls = () => (fs.existsSync(ghLog) ? fs.readFileSync(ghLog, 'utf-8').trim().split('\n').map((l) => JSON.parse(l)) : []);
const creates = () => ghCalls().filter((c) => c.args[0] === 'pr' && c.args[1] === 'create');

let pr = openPullRequest(repo, info, { title: 'feat: Dark mode', body: 'Body text\n' });
assert.deepStrictEqual(pr, { ok: true, url: 'https://github.com/acme/app/pull/7', existing: false });
assert.deepStrictEqual(ghCalls()[0].args.slice(0, 4), ['pr', 'list', '--head', 'feat/dark-mode']);
assert.strictEqual(creates().length, 1);
const call = creates()[0];
assert.deepStrictEqual(call.args.slice(0, 8), ['pr', 'create', '--base', 'main', '--head', 'feat/dark-mode', '--title', 'feat: Dark mode']);
assert.strictEqual(call.body, 'Body text\n');
// The branch reached origin with its upstream set.
assert.ok(execFileSync('git', ['--git-dir', bare, 'rev-parse', 'refs/heads/feat/dark-mode'], { encoding: 'utf-8' }).trim());
assert.strictEqual(git('rev-parse', '--abbrev-ref', 'feat/dark-mode@{upstream}'), 'origin/feat/dark-mode');

// Guard against a second PR: a known pr_url is reused without asking gh...
fs.rmSync(ghLog);
pr = openPullRequest(repo, { ...info, pr_url: 'https://github.com/acme/app/pull/7' }, { title: 't', body: 'b' });
assert.deepStrictEqual(pr, { ok: true, url: 'https://github.com/acme/app/pull/7', existing: true });
assert.deepStrictEqual(ghCalls(), []);
// ...and a PR already open for the branch is found and reused.
process.env.GH_STUB_OPEN_PR = 'https://github.com/acme/app/pull/9';
pr = openPullRequest(repo, info, { title: 't', body: 'b' });
assert.deepStrictEqual(pr, { ok: true, url: 'https://github.com/acme/app/pull/9', existing: true });
assert.strictEqual(creates().length, 0);
delete process.env.GH_STUB_OPEN_PR;

// gh failure -> not thrown, gh command left to run by hand.
process.env.GH_STUB_FAIL = '1';
pr = openPullRequest(repo, info, { title: 'feat: Dark mode', body: 'x' });
assert.strictEqual(pr.ok, false);
assert.strictEqual(pr.step, 'gh');
assert.match(pr.reason, /not logged in/);
assert.strictEqual(pr.commands.length, 1);
assert.match(pr.commands[0], /^gh pr create --base main --head feat\/dark-mode/);
delete process.env.GH_STUB_FAIL;

// Push failure -> both commands listed.
git('config', '--unset', `url.${bare.replace(/\\/g, '/')}.insteadOf`);
git('remote', 'set-url', 'origin', path.join(tmp, 'missing.git'));
pr = openPullRequest(repo, info, { title: 'feat: Dark mode', body: 'x' });
assert.strictEqual(pr.ok, false);
assert.strictEqual(pr.step, 'push');
assert.deepStrictEqual(pr.commands.map((c) => c.split(' ')[0]), ['git', 'gh']);

// Issues and auth (stub gh).
fs.rmSync(ghLog, { force: true });
assert.strictEqual(ghAuthenticated(repo), true);
assert.deepStrictEqual(ghCalls()[0].args, ['auth', 'status']);

const issue = createIssue(repo, { title: 'Crash on save', body: 'Body\n' });
assert.strictEqual(issue.number, 5);
assert.strictEqual(issue.url, 'https://github.com/acme/app/issues/5');
assert.ok(!Number.isNaN(Date.parse(issue.created_at)));
const issueCall = ghCalls().find((c) => c.args[0] === 'issue' && c.args[1] === 'create');
assert.deepStrictEqual(issueCall.args.slice(0, 4), ['issue', 'create', '--title', 'Crash on save']);
assert.strictEqual(issueCall.body, 'Body\n');

process.env.GH_STUB_NO_URL = '1';
assert.throws(() => createIssue(repo, { title: 't', body: 'b' }), /gh issue create printed no issue URL/);
delete process.env.GH_STUB_NO_URL;

assert.deepStrictEqual(commentOnIssue(repo, 5, 'Done\n'), { ok: true });
const commentCall = ghCalls().find((c) => c.args[0] === 'issue' && c.args[1] === 'comment');
assert.deepStrictEqual(commentCall.args.slice(0, 3), ['issue', 'comment', '5']);
assert.strictEqual(commentCall.body, 'Done\n');
assert.deepStrictEqual(closeIssue(repo, 5), { ok: true });
assert.deepStrictEqual(ghCalls().pop().args, ['issue', 'close', '5']);

process.env.GH_STUB_FAIL = '1';
assert.strictEqual(ghAuthenticated(repo), false);
assert.throws(() => createIssue(repo, { title: 't', body: 'b' }), /gh issue create failed: gh: not logged in/);
const failedComment = commentOnIssue(repo, 5, 'x');
assert.strictEqual(failedComment.ok, false);
assert.match(failedComment.reason, /not logged in/);
assert.match(failedComment.commands[0], /^gh issue comment 5 --body /);
const failedClose = closeIssue(repo, 5);
assert.strictEqual(failedClose.ok, false);
assert.deepStrictEqual(failedClose.commands, ['gh issue close 5']);
delete process.env.GH_STUB_FAIL;

// Issue body: only the report sections, in order, then the session and attribution lines.
const issueBody = buildIssueBody([
  { heading: 'Success Metrics', body: '- no crash' },
  { heading: 'Notes', body: 'skip me' },
  { heading: 'Problem Statement', body: 'It crashes.' },
], '2026-09-25__crash');
assert.match(issueBody, /^## Problem Statement\n\nIt crashes\.\n/);
assert.ok(issueBody.indexOf('Problem Statement') < issueBody.indexOf('Success Metrics'));
assert.doesNotMatch(issueBody, /Notes|skip me/);
assert.match(issueBody, /gps session: `2026-09-25__crash`/);
assert.match(issueBody, /Generated with \[Claude Code\]/);

delete process.env.GPS_GH_BIN;
fs.rmSync(tmp, { recursive: true, force: true });
console.log('# github.test.js: all assertions passed');
