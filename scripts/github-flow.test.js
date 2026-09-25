// scripts/github-flow.test.js
//
// A GitHub-hosted project (github.com origin, bare repo behind it, stub gh),
// through the real handlers:
//   A. bounded session: no branch, no PR, no gh call
//   B. planned session: branch at the plan write, PR at finish, PR reused on a re-run

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const SCRIPTS = __dirname;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-ghflow-'));
const root = path.join(tmp, 'repo');
const bare = path.join(tmp, 'origin.git');
const ghLog = path.join(tmp, 'gh-args.jsonl');
const ghStub = path.join(tmp, 'gh-stub.js');
fs.mkdirSync(root);

// Stub gh. Logs every call except auth and "pr list" (no PR is ever open).
// Issue numbers count up from 34. GH_STUB_FAIL_ISSUE / GH_STUB_FAIL_COMMENT
// make the matching call fail (before it is logged).
fs.writeFileSync(ghStub, `
const fs = require('fs');
const args = process.argv.slice(2);
if (args[0] === 'auth') process.exit(0);
if (args[0] === 'pr' && args[1] === 'list') process.exit(0);
if (process.env.GH_STUB_FAIL_ISSUE && args[0] === 'issue' && args[1] === 'create') { console.error('gh: HTTP 502'); process.exit(1); }
if (process.env.GH_STUB_FAIL_COMMENT && args[0] === 'issue' && args[1] === 'comment') { console.error('gh: HTTP 403'); process.exit(1); }
const bodyAt = args.indexOf('--body-file');
const body = bodyAt >= 0 ? fs.readFileSync(args[bodyAt + 1], 'utf-8') : null;
fs.appendFileSync(${JSON.stringify(ghLog)}, JSON.stringify({ args, body }) + '\\n');
if (args[0] === 'issue' && args[1] === 'create') {
  const created = fs.readFileSync(${JSON.stringify(ghLog)}, 'utf-8').split('\\n').filter((l) => l.includes('"issue","create"')).length;
  console.log('https://github.com/acme/app/issues/' + (33 + created));
  process.exit(0);
}
if (args[0] === 'issue') process.exit(0);
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

const ghCalls = () => (fs.existsSync(ghLog) ? fs.readFileSync(ghLog, 'utf-8').trim().split('\n').map((l) => JSON.parse(l)) : []);
const prCreates = () => ghCalls().filter((c) => c.args[0] === 'pr' && c.args[1] === 'create');

function currentSession() {
  const sessionId = fs.readFileSync(path.join(root, '.work', 'sessions', '.current-session'), 'utf-8');
  const sessionDir = path.join(root, '.work', 'sessions', sessionId);
  return { sessionId, sessionDir, configPath: path.join(sessionDir, '.session-config.json') };
}
const readConfig = (configPath) => JSON.parse(fs.readFileSync(configPath, 'utf-8'));

// "## <heading>" blocks for a write-target's sections.
const sectionsText = (target, problem) => target.sections
  .map((h) => `## ${h}\n\n${h === 'Problem Statement' ? problem : `${h}: approved.`}\n`).join('\n');

// A plan payload: the fields except Branch, the branch line, the sections, one ticket.
const planPayload = (target, branchLine, slug) =>
  target.fields.filter((f) => f !== 'Branch').map((label) => `**${label}:** 1 day\n`).join('') +
  `${branchLine}\n${sectionsText(target, 'unused')}\n--- ticket: 01-${slug} ---\nDo the work.\n`;

function markTicketDone(sessionDir, slug) {
  ok('ticket.js', '1');
  const log = path.join(sessionDir, '03-implement', `01-${slug}`, 'commit-log.md');
  fs.writeFileSync(log, fs.readFileSync(log, 'utf-8').replace(/^\*\*Status:\*\*.*$/m, '**Status:** ✅ Done'));
  ok('ticket-done.js', '1');
}

function commit(file, message) {
  fs.writeFileSync(path.join(root, file), `// ${file}\n`);
  git('add', file);
  git('commit', '-q', '-m', message);
}

const issueCalls = (verb) => ghCalls().filter((c) => c.args[0] === 'issue' && c.args[1] === verb);

// /gps issue + write the grill (files the issue); returns the session paths.
function startIssueSession(title, problem) {
  ok('issue-session.js', title);
  const session = currentSession();
  const grill = JSON.parse(ok('write-target.js').out);
  fs.writeFileSync(grill.payloadPath, sectionsText(grill, problem));
  ok('write-apply.js');
  return session;
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

// ------------------------------------------------ A. bounded: no branch, no PR
ok('start-session.js', 'Dark Mode');
let { sessionId, sessionDir, configPath } = currentSession();
const projectConfig = JSON.parse(fs.readFileSync(path.join(root, '.work', 'gps-config.json'), 'utf-8'));
assert.strictEqual(projectConfig.github.enabled, true, 'github.com origin + authenticated gh');

let target = JSON.parse(ok('write-target.js').out);
assert.strictEqual(target.target, 'grill');
assert.ok(!target.fields.includes('Branch'), 'the grill write asks for no branch');
assert.strictEqual(target.branchPattern, undefined);
fs.writeFileSync(target.payloadPath, sectionsText(target, 'Users want a dark theme.'));
let res = ok('write-apply.js');
assert.doesNotMatch(res.out, /Working on branch/);
assert.strictEqual(git('branch', '--show-current'), 'main');
assert.strictEqual(readConfig(configPath).git, undefined);
assert.ok(!readConfig(configPath).history.some((e) => e.event === 'branch_created'), 'bounded: no branch event');

commit('theme.js', 'feat: add dark theme');
res = ok('finish.js');
assert.doesNotMatch(res.out, /Pull request/);
assert.strictEqual(ghCalls().length, 0, 'a bounded session makes no gh call');
assert.doesNotMatch(fs.readFileSync(path.join(sessionDir, 'INDEX.md'), 'utf-8'), /Branch & PR/);
assert.strictEqual(git('branch', '--show-current'), 'main');

// ------------------------------------- B. planned: branch at the plan write, PR
ok('start-session.js', 'Search Filters');
({ sessionId, sessionDir, configPath } = currentSession());
target = JSON.parse(ok('write-target.js').out);
fs.writeFileSync(target.payloadPath, sectionsText(target, 'Users want to filter results.'));
ok('write-apply.js');
assert.strictEqual(git('branch', '--show-current'), 'main', 'no branch at the grill write');
ok('plan.js');

target = JSON.parse(ok('write-target.js').out);
assert.strictEqual(target.target, 'plan');
assert.ok(target.fields.includes('Branch'));
assert.match(target.branchPattern, /feat\|fix/);

// Missing / invalid branch -> payload error, nothing written, still on main.
const ticketsDir = path.join(sessionDir, '02-plan', 'tickets');
fs.writeFileSync(target.payloadPath, planPayload(target, '', 'filters'));
res = run('write-apply.js');
assert.strictEqual(res.code, 1);
assert.match(res.err, /Missing field "\*\*Branch:\*\*"/);
fs.writeFileSync(target.payloadPath, planPayload(target, '**Branch:** Search Filters\n', 'filters'));
res = run('write-apply.js');
assert.strictEqual(res.code, 1);
assert.match(res.err, /must look like/);
assert.strictEqual(git('branch', '--show-current'), 'main');
assert.ok(fs.existsSync(target.payloadPath), 'payload kept for a retry');
assert.ok(fs.readdirSync(ticketsDir).some((f) => f.includes('[slug]')), 'nothing written');

// Valid branch -> created from main, recorded, tickets written.
fs.writeFileSync(target.payloadPath, planPayload(target, '**Branch:** feat/search-filters\n', 'filters'));
res = ok('write-apply.js');
assert.match(res.out, /Working on branch feat\/search-filters \(from main\)/);
assert.strictEqual(git('branch', '--show-current'), 'feat/search-filters');
let config = readConfig(configPath);
assert.strictEqual(config.git.branch, 'feat/search-filters');
assert.strictEqual(config.git.base_branch, 'main');
assert.strictEqual(config.git.pr_url, null);
assert.doesNotMatch(fs.readFileSync(path.join(sessionDir, '02-plan', 'plan.md'), 'utf-8'), /Branch/);
const branchEvent = config.history.find((e) => e.event === 'branch_created');
assert.deepStrictEqual(branchEvent.detail, { branch: 'feat/search-filters', base: 'main' });
assert.strictEqual(branchEvent.at, config.git.branch_created_at);
assert.ok(config.history.findIndex((e) => e.event === 'branch_created') < config.history.findIndex((e) => e.event === 'plan_written'),
  'the branch was created before the plan files were written');

markTicketDone(sessionDir, 'filters');
commit('filters.js', 'feat: add filters');

// Finish refuses on the wrong branch, changing nothing.
git('switch', '-q', 'main');
const indexBefore = fs.readFileSync(path.join(sessionDir, 'INDEX.md'), 'utf-8');
const configBefore = fs.readFileSync(configPath, 'utf-8');
res = run('finish.js');
assert.strictEqual(res.code, 1);
assert.match(res.err, /on branch feat\/search-filters, but main is checked out/);
assert.strictEqual(fs.readFileSync(path.join(sessionDir, 'INDEX.md'), 'utf-8'), indexBefore);
assert.strictEqual(fs.readFileSync(configPath, 'utf-8'), configBefore);
git('switch', '-q', 'feat/search-filters');

// Finish pushes and opens the PR.
res = ok('finish.js');
assert.match(res.out, /Pull request: https:\/\/github\.com\/acme\/app\/pull\/12/);
assert.strictEqual(prCreates().length, 1);
const call = prCreates()[0];
assert.deepStrictEqual(call.args.slice(0, 8),
  ['pr', 'create', '--base', 'main', '--head', 'feat/search-filters', '--title', 'feat: Search Filters']);
assert.match(call.body, /Users want to filter results\./);
assert.match(call.body, /feat: add filters/);
assert.match(call.body, /- \[x\] 01 filters/);
assert.match(call.body, /Generated with \[Claude Code\]/);
assert.doesNotMatch(call.body, /Closes #/);
assert.ok(execFileSync('git', ['--git-dir', bare, 'rev-parse', 'refs/heads/feat/search-filters'], { encoding: 'utf-8' }).trim());

const index = fs.readFileSync(path.join(sessionDir, 'INDEX.md'), 'utf-8');
assert.match(index, /## Branch & PR/);
assert.match(index, /\*\*Branch:\*\* `feat\/search-filters`/);
assert.match(index, /\*\*Pull request:\*\* https:\/\/github\.com\/acme\/app\/pull\/12/);
config = readConfig(configPath);
assert.strictEqual(config.git.pr_url, 'https://github.com/acme/app/pull/12');

const status = JSON.parse(ok('status.js').out);
const summary = status.sessions.find((s) => s.sessionId === sessionId);
assert.strictEqual(summary.branch, 'feat/search-filters');
assert.strictEqual(summary.prUrl, 'https://github.com/acme/app/pull/12');

// A second finish is refused outright (the finished session is no longer current)...
res = run('finish.js');
assert.strictEqual(res.code, 1);
assert.match(res.err, /No current session/);
assert.strictEqual(prCreates().length, 1);
// ...and a finish interrupted after the PR was opened (simulated: the
// config keeps pr_url but not finished_at) reuses that PR on its re-run.
delete config.finished_at;
fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
fs.writeFileSync(path.join(root, '.work', 'sessions', '.current-session'), sessionId);
res = ok('finish.js');
assert.match(res.out, /Pull request \(already open, updated by the push\): https:\/\/github\.com\/acme\/app\/pull\/12/);
assert.strictEqual(prCreates().length, 1, 'no second PR');
assert.strictEqual(readConfig(configPath).history.filter((e) => e.event === 'pr_opened').length, 1);
assert.deepStrictEqual(readConfig(configPath).history.find((e) => e.event === 'pr_opened').detail,
  { url: 'https://github.com/acme/app/pull/12' });

// ------------------------------- C. issue session: the grill write files the issue
git('switch', '-q', 'main');
ok('issue-session.js', 'Crash on save');
({ sessionId, sessionDir, configPath } = currentSession());
assert.strictEqual(readConfig(configPath).kind, 'issue');
target = JSON.parse(ok('write-target.js').out);
assert.strictEqual(target.target, 'grill');
fs.writeFileSync(target.payloadPath, sectionsText(target, 'Saving a large file crashes the app.'));

// gh fails: nothing written, payload kept, the retry works.
process.env.GH_STUB_FAIL_ISSUE = '1';
res = run('write-apply.js');
assert.strictEqual(res.code, 1);
assert.match(res.err, /gh issue create failed: gh: HTTP 502 \(nothing was written\)/);
assert.ok(fs.existsSync(target.payloadPath), 'payload kept for a retry');
assert.match(fs.readFileSync(path.join(sessionDir, '01-grill', 'resume.md'), 'utf-8'), /gps:fill/, 'resume still unfilled');
assert.strictEqual(readConfig(configPath).issue, undefined);
delete process.env.GH_STUB_FAIL_ISSUE;

res = ok('write-apply.js');
assert.match(res.out, /Issue #34: https:\/\/github\.com\/acme\/app\/issues\/34/);
config = readConfig(configPath);
assert.strictEqual(config.issue.number, 34);
assert.strictEqual(config.issue.url, 'https://github.com/acme/app/issues/34');
const issueCreates = ghCalls().filter((c) => c.args[0] === 'issue' && c.args[1] === 'create');
assert.strictEqual(issueCreates.length, 1);
assert.deepStrictEqual(issueCreates[0].args.slice(0, 4), ['issue', 'create', '--title', 'Crash on save']);
assert.match(issueCreates[0].body, /## Problem Statement\n\nSaving a large file crashes the app\./);
assert.match(issueCreates[0].body, /## Context & Constraints/);
assert.match(issueCreates[0].body, /gps session: `.+__crash-on-save`/);
assert.strictEqual(git('branch', '--show-current'), 'main', 'an issue session creates no branch at the grill write');
assert.strictEqual(config.git, undefined);
assert.deepStrictEqual(config.history.map((e) => e.event), ['session_started', 'issue_created', 'grill_written']);
assert.deepStrictEqual(config.history[1].detail, { number: 34, url: 'https://github.com/acme/app/issues/34' });
assert.strictEqual(config.history[1].at, config.issue.created_at);
assert.strictEqual(
  JSON.parse(ok('status.js').out).sessions.find((s) => s.sessionId === sessionId).issueUrl,
  'https://github.com/acme/app/issues/34'
);

// --------- C (continued). bounded issue session: finish comments, does not close
commit('save-fix.js', 'fix: handle large saves (#34)');
res = ok('finish.js');
assert.match(res.out, /Summary posted on issue #34/);
assert.strictEqual(issueCalls('comment').length, 1);
assert.deepStrictEqual(issueCalls('comment')[0].args.slice(0, 3), ['issue', 'comment', '34']);
assert.match(issueCalls('comment')[0].body, /Saving a large file crashes the app\./);
assert.match(issueCalls('comment')[0].body, /fix: handle large saves/);
assert.strictEqual(issueCalls('close').length, 0, 'closing needs --close-issue');
assert.strictEqual(prCreates().length, 1, 'a bounded issue session opens no PR (only B did)');
let issueIndex = fs.readFileSync(path.join(sessionDir, 'INDEX.md'), 'utf-8');
assert.match(issueIndex, /## Issue/);
assert.match(issueIndex, /https:\/\/github\.com\/acme\/app\/issues\/34/);
assert.match(issueIndex, /Summary comment:\*\* posted/);
assert.match(issueIndex, /Closed:\*\* no/);
assert.doesNotMatch(issueIndex, /Branch & PR/);
config = readConfig(configPath);
assert.strictEqual(config.issue.commented, true);
assert.strictEqual(config.issue.closed, undefined);
assert.deepStrictEqual(config.history.map((e) => e.event),
  ['session_started', 'issue_created', 'grill_written', 'issue_commented', 'session_finished']);
assert.match(issueIndex, /## Timeline/);
assert.match(issueIndex, /\| issue_commented \|/);

// ------------------------------- E. bounded issue session, closed with the flag
({ sessionId, sessionDir, configPath } = startIssueSession('Typo in footer', 'The footer says "Copyrigth".'));
const typoIssue = readConfig(configPath).issue.number;
commit('footer.js', 'fix: footer typo');
res = ok('finish.js', '--close-issue');
assert.match(res.out, new RegExp(`Issue #${typoIssue} closed`));
assert.deepStrictEqual(issueCalls('close').pop().args, ['issue', 'close', String(typoIssue)]);
assert.strictEqual(readConfig(configPath).issue.closed, true);
assert.match(fs.readFileSync(path.join(sessionDir, 'INDEX.md'), 'utf-8'), /Closed:\*\* yes/);
assert.deepStrictEqual(readConfig(configPath).history.map((e) => e.event),
  ['session_started', 'issue_created', 'grill_written', 'issue_commented', 'issue_closed', 'session_finished']);

// ------------------------- G. gh comment fails: finish still succeeds, commands listed
({ sessionId, sessionDir, configPath } = startIssueSession('Broken link', 'The docs link 404s.'));
const linkIssue = readConfig(configPath).issue.number;
commit('docs.js', 'fix: docs link');
process.env.GH_STUB_FAIL_COMMENT = '1';
res = ok('finish.js');
delete process.env.GH_STUB_FAIL_COMMENT;
assert.match(res.err, new RegExp(`Issue #${linkIssue}: comment failed \\(gh: HTTP 403\\)`));
assert.match(res.err, new RegExp(`gh issue comment ${linkIssue} --body`));
assert.strictEqual(readConfig(configPath).issue.commented, undefined);
issueIndex = fs.readFileSync(path.join(sessionDir, 'INDEX.md'), 'utf-8');
assert.match(issueIndex, /Summary comment:\*\* not posted/);
assert.match(issueIndex, new RegExp(`gh issue comment ${linkIssue} --body`));

// ------------------- H. planned issue session: branch + PR "Closes #N", no comment/close
git('switch', '-q', 'main');
({ sessionId, sessionDir, configPath } = startIssueSession('Slow search', 'Search takes ten seconds.'));
const searchIssue = readConfig(configPath).issue.number;
ok('plan.js');
target = JSON.parse(ok('write-target.js').out);
fs.writeFileSync(target.payloadPath, planPayload(target, '**Branch:** fix/slow-search\n', 'index'));
ok('write-apply.js');
assert.strictEqual(git('branch', '--show-current'), 'fix/slow-search');
markTicketDone(sessionDir, 'index');
commit('index.js', 'fix: index search terms');
const commentsBefore = issueCalls('comment').length;
const closesBefore = issueCalls('close').length;
res = ok('finish.js', '--close-issue');
assert.match(res.err, /--close-issue ignored: the pull request closes the issue when it is merged/);
const searchPr = prCreates().pop();
assert.strictEqual(searchPr.args[searchPr.args.indexOf('--title') + 1], 'fix: Slow search');
assert.match(searchPr.body, new RegExp(`Closes #${searchIssue}`));
assert.strictEqual(issueCalls('comment').length, commentsBefore, 'the PR closes the issue: no comment');
assert.strictEqual(issueCalls('close').length, closesBefore, 'the PR closes the issue: no close');
issueIndex = fs.readFileSync(path.join(sessionDir, 'INDEX.md'), 'utf-8');
assert.match(issueIndex, /## Issue/);
assert.match(issueIndex, /Closed by:\*\* the pull request/);
assert.match(issueIndex, /## Branch & PR/);
const plannedEvents = readConfig(configPath).history.map((e) => e.event);
assert.ok(['issue_created', 'branch_created', 'plan_written', 'ticket_done', 'pr_opened', 'session_finished']
  .every((name) => plannedEvents.includes(name)), `planned issue session events: ${plannedEvents.join(', ')}`);
assert.ok(!plannedEvents.includes('issue_commented') && !plannedEvents.includes('issue_closed'));
assert.ok(plannedEvents.indexOf('pr_opened') < plannedEvents.indexOf('session_finished'));
assert.match(issueIndex, /\| pr_opened \|/);

fs.rmSync(tmp, { recursive: true, force: true });
console.log('# github-flow.test.js: all assertions passed');
