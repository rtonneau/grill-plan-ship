# GitHub project config, plan-time branches and `/gps issue` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record GitHub availability once in `.work/gps-config.json`, create the session branch only when a plan is written, and add `/gps issue` (report as a GitHub issue, then work on it).

**Architecture:** A small `project-config.js` module owns the flag (detected once, then only read). `write-target.js`/`write-apply.js` move branch creation from the grill write to the plan write and read the flag. `start-session.js` and the new `issue-session.js` share `lib/session-init.js`. `github.js` gains the `gh issue` helpers; `write-apply.js` files the issue at the grill write and `finish.js` comments/closes it (bounded) or adds `Closes #N` to the PR (planned).

**Tech Stack:** Node.js >= 20, `fs`/`child_process` only, no dependencies. Tests are plain `assert` scripts run by `npm test` (`node scripts/run-tests.js`).

**Spec:** `docs/superpowers/specs/2026-09-25-github-config-issue-design.md`

## Global Constraints

- Node >= 20, no external dependencies; git and gh run via `execFileSync` with an argument array, never a shell string.
- Handler output uses `✅` for success, `❌` for errors (via `GpsError` + `runCli`), `⚠️` for warnings; timestamps are `new Date().toISOString()`.
- Version is already `1.4.0` (committed as `6d0d011`): do not touch `package.json` or `.claude-plugin/*.json`.
- `skills/gps/SKILL.md` must stay <= 70 lines and `skills/gps/references/write.md` <= 50 lines (`scripts/handlers.test.js` enforces both).
- `/gps status` (`status.js`) is read-only: it must never create or modify anything under `.work/` (`e2e.test.js` hashes it), so it must not call `ensureProjectConfig`.
- Session state is never edited by hand outside the handlers; tests drive the real handler scripts.
- Every commit message ends with these two lines (blank line before them):
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_013xhs9GDjP55qn7JDAWH7pf
  ```
- Work happens on branch `feat/github-config-issue` (already checked out). Run the whole suite with `npm test` before each commit that touches handlers.

---

### Task 1: `gh` helpers in `github.js` (auth, issues)

**Files:**
- Modify: `scripts/lib/github.js`
- Test: `scripts/lib/github.test.js`

**Interfaces:**
- Consumes: existing `runGh`, `failureReason`, `lastUrl`, `PR_ATTRIBUTION`.
- Produces (all exported from `scripts/lib/github.js`):
  - `ghAuthenticated(projectRoot) -> boolean` (`gh auth status` exits 0).
  - `createIssue(projectRoot, { title, body }) -> { number: number, url: string, created_at: string }`; **throws** `Error('gh issue create failed: <reason>')` or `Error('gh issue create printed no issue URL')`.
  - `commentOnIssue(projectRoot, number, body) -> { ok: true } | { ok: false, reason: string, commands: string[] }` (never throws).
  - `closeIssue(projectRoot, number) -> { ok: true } | { ok: false, reason: string, commands: string[] }` (never throws).
  - `buildIssueBody(sections, sessionId) -> string` where `sections` is `[{ heading, body }]` (as `parsePayload` returns).

- [ ] **Step 1: Extend the test's stub `gh` and imports**

In `scripts/lib/github.test.js`, change the import block:

```js
const {
  isGithubUrl, detectGithub, currentBranch, validateBranchName, createSessionBranch,
  branchType, commitsBetween, hasUncommittedChanges, openPullRequest,
  ghAuthenticated, createIssue, commentOnIssue, closeIssue, buildIssueBody,
} = require('./github');
```

Replace the stub body (the template string written to `ghStub`) with this version (it adds `auth` and `issue` handling and keeps the old behaviour):

```js
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
```

Change the `creates` helper so it only counts PR creations (issue creation also has `args[1] === 'create'`):

```js
const creates = () => ghCalls().filter((c) => c.args[0] === 'pr' && c.args[1] === 'create');
```

- [ ] **Step 2: Add the failing tests**

In `scripts/lib/github.test.js`, insert this block immediately before the line `delete process.env.GPS_GH_BIN;`:

```js
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

```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node scripts/lib/github.test.js`
Expected: FAIL with `TypeError: ghAuthenticated is not a function` (or similar for `createIssue`).

- [ ] **Step 4: Implement**

In `scripts/lib/github.js`:

1. Replace the header comment's first two lines:

```js
// Session branch + pull request support for projects hosted on GitHub.
// /gps write (grill) creates the session's branch; /gps finish pushes it and
// opens a PR against the branch it started from. Git and gh always run via
// execFileSync with an argument array (never a shell string).
```

with:

```js
// Session branch, pull request and issue support for projects hosted on GitHub.
// /gps write (plan) creates the session's branch; /gps finish pushes it and
// opens a PR against the branch it started from. /gps issue files a GitHub
// issue at the grill write; /gps finish comments on it. Git and gh always run
// via execFileSync with an argument array (never a shell string).
```

2. After the `PR_ATTRIBUTION` constant add:

```js
const ISSUE_SECTIONS = ['Problem Statement', 'Context & Constraints', 'Success Metrics'];
const ISSUE_URL_RE = /^https:\/\/\S+\/issues\/(\d+)$/;
```

3. After the `runGh` function add:

```js
// True when `gh auth status` succeeds (gh installed and logged in).
function ghAuthenticated(projectRoot) {
  try {
    runGh(projectRoot, ['auth', 'status']);
    return true;
  } catch (_err) {
    return false;
  }
}
```

4. After the `lastUrl` function add the temp-file helper:

```js
// Writes `body` to a temp file, runs fn(filePath), always removes the file.
function withBodyFile(body, fn) {
  const bodyFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gps-gh-')), 'body.md');
  fs.writeFileSync(bodyFile, body);
  try {
    return fn(bodyFile);
  } finally {
    fs.rmSync(path.dirname(bodyFile), { recursive: true, force: true });
  }
}
```

5. In `openPullRequest`, replace everything from `const bodyFile = path.join(fs.mkdtempSync(` to the function's closing `}` with:

```js
  return withBodyFile(body, (bodyFile) => {
    try {
      const url = lastUrl(runGh(projectRoot, [
        'pr', 'create',
        '--base', gitInfo.base_branch, '--head', gitInfo.branch,
        '--title', title, '--body-file', bodyFile,
      ]));
      if (!url) return { ok: false, step: 'gh', reason: 'gh printed no PR URL', commands: commands.slice(1) };
      return { ok: true, url, existing: false };
    } catch (err) {
      return { ok: false, step: 'gh', reason: failureReason(err), commands: commands.slice(1) };
    }
  });
}
```

6. After `openPullRequest` add:

```js
// Body of the GitHub issue filed from a grill resume: the report sections
// (in ISSUE_SECTIONS order), the session id and the attribution line.
function buildIssueBody(sections, sessionId) {
  const parts = ISSUE_SECTIONS
    .map((heading) => sections.find((s) => s.heading === heading))
    .filter(Boolean)
    .map((s) => `## ${s.heading}\n\n${s.body}\n`);
  return [...parts, `gps session: \`${sessionId}\``, '', PR_ATTRIBUTION, ''].join('\n');
}

// Files an issue. Throws Error with gh's reason on failure.
function createIssue(projectRoot, { title, body }) {
  return withBodyFile(body, (bodyFile) => {
    let output;
    try {
      output = runGh(projectRoot, ['issue', 'create', '--title', title, '--body-file', bodyFile]);
    } catch (err) {
      throw new Error(`gh issue create failed: ${failureReason(err)}`);
    }
    const url = String(output).split('\n').map((l) => l.trim()).filter((l) => ISSUE_URL_RE.test(l)).pop();
    if (!url) throw new Error('gh issue create printed no issue URL');
    return { number: Number(url.match(ISSUE_URL_RE)[1]), url, created_at: new Date().toISOString() };
  });
}

// Never throws: { ok: true } or { ok: false, reason, commands }.
function commentOnIssue(projectRoot, number, body) {
  return withBodyFile(body, (bodyFile) => {
    try {
      runGh(projectRoot, ['issue', 'comment', String(number), '--body-file', bodyFile]);
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: failureReason(err), commands: [`gh issue comment ${number} --body "<summary of the work>"`] };
    }
  });
}

function closeIssue(projectRoot, number) {
  try {
    runGh(projectRoot, ['issue', 'close', String(number)]);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: failureReason(err), commands: [`gh issue close ${number}`] };
  }
}
```

7. Add to `module.exports`: `ghAuthenticated,`, `buildIssueBody,`, `createIssue,`, `commentOnIssue,`, `closeIssue,`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `node scripts/lib/github.test.js`
Expected: `# github.test.js: all assertions passed`

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: all test files pass (exit 0).

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/github.js scripts/lib/github.test.js
git commit -m "feat(github): gh auth and issue helpers"
```

---

### Task 2: `project-config.js` (the GitHub flag)

**Files:**
- Create: `scripts/lib/project-config.js`
- Test: `scripts/lib/project-config.test.js`

**Interfaces:**
- Consumes: `detectGithub(projectRoot)`, `ghAuthenticated(projectRoot)` from `./github` (Task 1); `GpsError`, `readJson`, `writeJsonAtomic` from `./guard`.
- Produces (exported from `scripts/lib/project-config.js`):
  - `CONFIG_FILENAME` = `'gps-config.json'`
  - `ensureProjectConfig(projectRoot) -> { version: 1, github: { enabled: boolean, detected_at: string } }` — creates `.work/gps-config.json` on first call; validates it afterwards; throws `GpsError` when invalid.
  - `githubEnabled(projectRoot) -> boolean`

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/project-config.test.js`:

```js
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
assert.throws(() => ensureProjectConfig(plain), (err) => err instanceof GpsError && /github\.enabled/.test(err.message) && err.hint);
assert.strictEqual(fs.readFileSync(configFile(plain), 'utf-8'), JSON.stringify({ version: 1, github: { enabled: 'yes' } }));

delete process.env.GPS_GH_BIN;
fs.rmSync(tmp, { recursive: true, force: true });
console.log('# project-config.test.js: all assertions passed');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/lib/project-config.test.js`
Expected: FAIL with `Cannot find module './project-config'`.

- [ ] **Step 3: Implement**

Create `scripts/lib/project-config.js`:

```js
// scripts/lib/project-config.js
//
// Project-wide gps settings in <projectRoot>/.work/gps-config.json. Today
// that is one flag, github.enabled: true when origin is on github.com AND
// `gh auth status` succeeds. It is detected once, when the file is first
// created, and only read afterwards, so editing the file by hand forces
// GitHub features on or off (GitHub Enterprise, opting out, gh login later).

const fs = require('fs');
const path = require('path');
const { GpsError, readJson, writeJsonAtomic } = require('./guard');
const { detectGithub, ghAuthenticated } = require('./github');

const CONFIG_FILENAME = 'gps-config.json';
const CONFIG_VERSION = 1;

function configPath(projectRoot) {
  return path.join(projectRoot, '.work', CONFIG_FILENAME);
}

function validate(config, filePath) {
  if (!config || !config.github || typeof config.github.enabled !== 'boolean') {
    throw new GpsError(
      `${CONFIG_FILENAME} is invalid: "github.enabled" must be true or false (${filePath}).`,
      'Fix the file by hand, or delete it so the next command detects GitHub again.'
    );
  }
  return config;
}

// The parsed config; creates the file (detecting GitHub) when it is missing.
function ensureProjectConfig(projectRoot) {
  const filePath = configPath(projectRoot);
  if (fs.existsSync(filePath)) return validate(readJson(filePath, CONFIG_FILENAME), filePath);

  const config = {
    version: CONFIG_VERSION,
    github: {
      enabled: detectGithub(projectRoot) && ghAuthenticated(projectRoot),
      detected_at: new Date().toISOString(),
    },
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  writeJsonAtomic(filePath, config);
  return config;
}

function githubEnabled(projectRoot) {
  return ensureProjectConfig(projectRoot).github.enabled;
}

module.exports = { CONFIG_FILENAME, ensureProjectConfig, githubEnabled };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node scripts/lib/project-config.test.js`
Expected: `# project-config.test.js: all assertions passed`

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/project-config.js scripts/lib/project-config.test.js
git commit -m "feat: project config with a detected-once GitHub flag"
```

---

### Task 3: Branch at the plan write, driven by the project config

**Files:**
- Modify: `scripts/write-target.js`, `scripts/write-apply.js`, `scripts/start-session.js`, `scripts/finish.js` (comment only), `skills/gps/references/write.md`, `skills/gps/references/start.md`, `skills/gps/references/plan.md`
- Rewrite: `scripts/github-flow.test.js`

**Interfaces:**
- Consumes: `githubEnabled`, `ensureProjectConfig` (Task 2); `validateBranchName`, `createSessionBranch` (existing).
- Produces:
  - `write-target.js` JSON gains `fields: [... 'Branch']` and `branchPattern` for the **plan** phase when `githubEnabled` and the session has no `git` record; the grill phase no longer offers them.
  - `write-apply.js` validates + creates the branch at the plan write and saves `config.git = { branch, base_branch, branch_created_at, pr_url: null }`; prints `🌿 Working on branch <b> (from <base>); /gps finish opens the PR.`
  - The shared test stub in `scripts/github-flow.test.js` (handles `auth`, `pr list`, `pr create`, `issue create/comment/close`, and the env switches `GH_STUB_FAIL_ISSUE`, `GH_STUB_FAIL_COMMENT`) and helpers `currentSession()`, `readConfig()`, `sectionsText()`, `planPayload()`, `markTicketDone()`, `commit()`, `ghCalls()`, `prCreates()` that Tasks 5 and 6 extend.

- [ ] **Step 1: Rewrite `scripts/github-flow.test.js` for the new behaviour (failing test)**

Replace the whole file with:

```js
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
}

function commit(file, message) {
  fs.writeFileSync(path.join(root, file), `// ${file}\n`);
  git('add', file);
  git('commit', '-q', '-m', message);
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

fs.rmSync(tmp, { recursive: true, force: true });
console.log('# github-flow.test.js: all assertions passed');
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node scripts/github-flow.test.js`
Expected: FAIL at `assert.ok(!target.fields.includes('Branch'), 'the grill write asks for no branch')` (the grill phase still asks for a branch and `gps-config.json` is not created yet).

- [ ] **Step 3: `start-session.js` creates the project config**

In `scripts/start-session.js`, add the import after the `guard` require:

```js
const { ensureProjectConfig } = require('./lib/project-config');
```

and at the very start of `function startSession(featureName) {` (before `const now = new Date();`) add:

```js
  ensureProjectConfig(process.cwd()); // detects GitHub once; a corrupt file aborts before anything is created
```

- [ ] **Step 4: `write-target.js` offers the branch at the plan phase**

In `scripts/write-target.js`:

1. Header comment: replace `(plus a\n * "**Branch:**" field for the grill phase of a GitHub project)` with `(plus a\n * "**Branch:**" field for the plan phase of a GitHub project)`.
2. Replace `const { detectGithub, BRANCH_PATTERN } = require('./lib/github');` with:

```js
const { BRANCH_PATTERN } = require('./lib/github');
const { githubEnabled } = require('./lib/project-config');
```

3. Replace the block

```js
    // GitHub projects: the grill payload also names the session branch,
    // which write-apply.js creates (see lib/github.js).
    if (result.target === 'grill' && detectGithub(process.cwd())) {
```

with

```js
    // GitHub projects: the plan payload also names the session branch (unless
    // the session already has one), which write-apply.js creates (see lib/github.js).
    if (result.target === 'plan' && !config.git && githubEnabled(process.cwd())) {
```

- [ ] **Step 5: `write-apply.js` creates the branch at the plan write**

In `scripts/write-apply.js`:

1. Replace the header lines

```
 * Grill phase in a GitHub project: also creates the session branch named
 * by the payload's "**Branch:**" field (from the current HEAD) and records
 * it in .session-config.json as `git`, for /gps finish to open the PR.
```

with

```
 * Plan phase in a GitHub project (github.enabled in .work/gps-config.json),
 * for a session without a branch yet: also creates the session branch named
 * by the payload's "**Branch:**" field (from the current HEAD) and records
 * it in .session-config.json as `git`, for /gps finish to open the PR.
 * Bounded sessions (no plan) never get a branch.
```

2. Replace `const { detectGithub, validateBranchName, createSessionBranch } = require('./lib/github');` with:

```js
const { validateBranchName, createSessionBranch } = require('./lib/github');
const { githubEnabled } = require('./lib/project-config');
```

3. Replace `const branch = target === 'grill' && detectGithub(projectRoot) ? payload.fields.Branch || '' : null;` with:

```js
  const branch = target === 'plan' && !config.git && githubEnabled(projectRoot) ? payload.fields.Branch || '' : null;
```

4. Replace the grill block

```js
  if (target === 'grill') {
    if (gitInfo) {
      config.git = gitInfo;
      writeJsonAtomic(configPath, config);
    }
    fs.unlinkSync(payloadPath);
    console.log(`✅ Grill written for ${sessionId}. Next: /gps plan`);
    if (gitInfo) console.log(`🌿 Working on branch ${gitInfo.branch} (from ${gitInfo.base_branch}); /gps finish opens the PR.`);
    return;
  }
```

with

```js
  if (target === 'grill') {
    fs.unlinkSync(payloadPath);
    console.log(`✅ Grill written for ${sessionId}. Next: /gps plan`);
    return;
  }
```

5. Replace the final lines

```js
  fs.unlinkSync(payloadPath);
  console.log(`✅ Plan written for ${sessionId}: ${tickets.length} ticket(s). Next: /gps ship`);
});
```

with

```js
  if (gitInfo) {
    config.git = gitInfo;
    writeJsonAtomic(configPath, config);
  }
  fs.unlinkSync(payloadPath);
  console.log(`✅ Plan written for ${sessionId}: ${tickets.length} ticket(s). Next: /gps ship`);
  if (gitInfo) console.log(`🌿 Working on branch ${gitInfo.branch} (from ${gitInfo.base_branch}); /gps finish opens the PR.`);
});
```

- [ ] **Step 6: Fix the wording in `finish.js`'s header**

In `scripts/finish.js` replace `(\`git\` in the config, set by /gps write in a\n * GitHub project)` with `(\`git\` in the config, set by the plan write in a\n * GitHub project)`. Add one sentence after the paragraph that ends `list the commands to run by hand.`: `Bounded sessions have no branch, so they open no PR.`

- [ ] **Step 7: Update the reference docs (keep `write.md` at or under 50 lines: replace lines, don't add any)**

In `skills/gps/references/write.md`:

- Replace the line starting `   - **\`Branch\` field (grill phase, GitHub projects only):**` with:
  `   - **\`Branch\` field (plan phase, GitHub projects only, when \`fields\` lists it):** name the session branch after the approved plan, shaped like \`branchPattern\`: the type that fits the work (\`feat\`, \`fix\`, \`refactor\`, \`docs\`, \`chore\`, \`perf\`, \`test\`), then a short lowercase slug naming the change, not the session. E.g. \`**Branch:** feat/dark-mode-toggle\`. Pick it yourself; don't ask the user.`
- Replace the `✅` bullet under step 3 with:
  `   - \`✅\`: relay its line; it names the next command. On the plan phase of a GitHub project it also creates the branch from the current HEAD, switches to it and prints \`🌿 Working on branch …\`: relay that too. All later commits for this session go on that branch.`

In `skills/gps/references/start.md`, replace the sentence `On a GitHub project this also creates and checks out the session branch, so the implementation lands there.` with `Bounded work creates no branch: the implementation lands on the branch that is checked out, and \`/gps finish\` opens no PR.`

In `skills/gps/references/plan.md`, replace the line starting `**Next:** Once the tickets are approved` with:
`**Next:** Once the tickets are approved, run \`/gps write\` to save the plan and tickets to disk (on a GitHub project it also creates the session branch), then \`/gps ship\` to implement them.`

- [ ] **Step 8: Run the integration test and the whole suite**

Run: `node scripts/github-flow.test.js`
Expected: `# github-flow.test.js: all assertions passed`

Run: `npm test`
Expected: exit 0 (this also runs the `write.md` <= 50 lines check in `handlers.test.js`).

- [ ] **Step 9: Commit**

```bash
git add scripts skills
git commit -m "feat: create the session branch at the plan write, not for bounded sessions"
```

---

### Task 4: `/gps issue` command and shared session setup

**Files:**
- Create: `scripts/lib/session-init.js`, `scripts/issue-session.js`, `skills/gps/references/issue.md`
- Modify: `scripts/start-session.js`, `skills/gps/SKILL.md`, `scripts/handlers.test.js`

**Interfaces:**
- Consumes: `ensureProjectConfig`, `githubEnabled` (Task 2).
- Produces:
  - `initSession(projectRoot, featureName, extraConfig = {}) -> { sessionId, slug, sessionsDir, workDir, grillDir, scratchDir, gitignoreAdded }` (creates the session, scratch dir, config with `...extraConfig`, templates, INDEX.md and `.current-session`; prints the "cleaned to" note; throws `GpsError` if the session exists).
  - `announceSession(session)` prints the `✅ Session initialized` / `Path` / `Scratch dir` / `.gitignore` lines.
  - `scripts/issue-session.js "<title>"` creates a session whose `.session-config.json` has `kind: "issue"`; exits 1 with `❌ Missing issue title.` + `Usage: /gps issue <title>`; prints a `⚠️` to stderr when `github.enabled` is false.

- [ ] **Step 1: Write the failing test**

In `scripts/handlers.test.js`, insert this block immediately before the block that starts with the comment `// SKILL.md router: every command has a references file carrying its handler lines` (i.e. before its opening `{`):

```js
{
  // /gps issue: same session setup as start, marked kind "issue"; local when GitHub is off
  const root = tempProject();
  const noTitle = run(root, 'issue-session.js');
  assert.strictEqual(noTitle.code, 1);
  assert.match(noTitle.err, /Missing issue title/);
  assert.match(noTitle.err, /Usage: \/gps issue <title>/);
  assert.ok(!fs.existsSync(path.join(root, '.work')), 'a refused command creates nothing');

  const created = run(root, 'issue-session.js', 'Crash on save');
  assert.strictEqual(created.code, 0, created.err);
  assert.match(created.err, /GitHub is not enabled for this project/);
  const id = currentSession(root);
  assert.match(id, /^\d{4}-\d{2}-\d{2}__crash-on-save$/);
  const config = JSON.parse(fs.readFileSync(path.join(sessionsDir(root), id, '.session-config.json'), 'utf-8'));
  assert.strictEqual(config.kind, 'issue');
  assert.strictEqual(config.feature_name, 'Crash on save');
  assert.strictEqual(config.issue, undefined);
  const projectConfig = JSON.parse(fs.readFileSync(path.join(root, '.work', 'gps-config.json'), 'utf-8'));
  assert.strictEqual(projectConfig.github.enabled, false);
  assert.ok(fs.existsSync(path.join(sessionsDir(root), id, '01-grill', 'resume.md')));

  const again = run(root, 'issue-session.js', 'Crash on save');
  assert.strictEqual(again.code, 1);
  assert.match(again.err, /already exists/);
}

```

In the same file, in the `handlers` map of the router block add `issue: ['issue-session.js'],` right after the `start: ['start-session.js'],` line.

- [ ] **Step 2: Run it to verify it fails**

Run: `node scripts/handlers.test.js`
Expected: FAIL (`issue-session.js` does not exist, so `noTitle.code` is not 1 / a `Cannot find module` error).

- [ ] **Step 3: Create `scripts/lib/session-init.js`**

```js
// scripts/lib/session-init.js
//
// Session directory setup shared by /gps start and /gps issue.
// Creates .work/sessions/YYYY-MM-DD__<slug>/ (01-grill/resume.md + notes.md,
// .session-config.json, INDEX.md), the session's scratch directory, the
// .gitignore entries and .current-session. <slug> is the feature name
// cleaned by slugify(); the date is the local date. If the session already
// exists, nothing is written and it throws a GpsError.

const fs = require('fs');
const path = require('path');
const { loadTemplate, renderTemplate } = require('./templates');
const { setCurrentSession } = require('./session-store');
const { TEMPLATE_VERSION } = require('./write-target');
const { touchPhase } = require('./token-usage');
const { ensureScratchDir, ensureGitignoreEntry } = require('./scratch-dir');
const { GpsError, localDate, slugify, writeJsonAtomic } = require('./guard');

// `extraConfig` is merged into .session-config.json (e.g. { kind: 'issue' }).
function initSession(projectRoot, featureName, extraConfig = {}) {
  const now = new Date();
  const slug = slugify(featureName, now);
  const sessionId = `${localDate(now)}__${slug}`;

  const sessionsDir = path.join(projectRoot, '.work', 'sessions');
  const workDir = path.join(sessionsDir, sessionId);
  const grillDir = path.join(workDir, '01-grill');

  if (fs.existsSync(workDir)) {
    throw new GpsError(
      `Session ${sessionId} already exists; nothing was changed.`,
      'Run /gps status to see where it left off, or pick a different feature name.'
    );
  }

  if (slug !== featureName) {
    console.log(`Feature name "${featureName}" cleaned to "${slug}".`);
  }

  fs.mkdirSync(grillDir, { recursive: true });

  const scratchDir = ensureScratchDir(projectRoot, sessionId);
  const gitignoreAdded = ['.work/', '.scratch/'].filter((entry) => ensureGitignoreEntry(projectRoot, entry));

  const config = {
    session_id: sessionId,
    feature_name: featureName,
    scratch_dir: scratchDir,
    created_at: now.toISOString(),
    template_version: TEMPLATE_VERSION,
    ...extraConfig,
  };

  touchPhase(config, 'grill');

  writeJsonAtomic(path.join(workDir, '.session-config.json'), config);

  const resumeContent = renderTemplate(loadTemplate('01-grill-resume.md'), {
    'feature-name': featureName,
    timestamp: config.created_at,
  });

  fs.writeFileSync(path.join(grillDir, 'resume.md'), resumeContent);
  fs.writeFileSync(path.join(grillDir, 'notes.md'), '# Brainstorm Transcript\n\n(To be filled)\n');

  fs.writeFileSync(
    path.join(workDir, 'INDEX.md'),
    `# Session: ${featureName}\n\nPhase: Grill (in progress)\n`
  );

  setCurrentSession(sessionsDir, sessionId);

  return { sessionId, slug, sessionsDir, workDir, grillDir, scratchDir, gitignoreAdded };
}

function announceSession(session) {
  console.log(`✅ Session initialized: ${session.sessionId}`);
  console.log(`Path: ${session.workDir}`);
  console.log(`Scratch dir: ${session.scratchDir} (run/test artifacts go here)`);
  for (const entry of session.gitignoreAdded) console.log(`Added "${entry}" to .gitignore`);
}

module.exports = { initSession, announceSession };
```

- [ ] **Step 4: Slim `scripts/start-session.js` down to use it**

Replace everything after the header comment (from `const fs = require('fs');` to the end of the file) with:

```js
const path = require('path');
const { ensureProjectConfig } = require('./lib/project-config');
const { initSession, announceSession } = require('./lib/session-init');
const { getSeed, removeSeed } = require('./lib/seeds-store');
const { GpsError, runCli } = require('./lib/guard');

function startSession(featureName) {
  const projectRoot = process.cwd();
  ensureProjectConfig(projectRoot); // detects GitHub once; a corrupt file aborts before anything is created

  const session = initSession(projectRoot, featureName);
  announceSession(session);

  const seed = getSeed(session.sessionsDir, session.slug);
  if (seed) {
    removeSeed(session.sessionsDir, session.slug);
    console.log(`\nScout seed found for "${session.slug}" (from ${seed.sourceReport}):`);
    console.log(JSON.stringify(seed, null, 2));
    console.log(`\nOpen brainstorming seeded with this candidate's problem/solution/files instead of starting from zero.`);
  } else {
    console.log(`\nNext: the brainstorming conversation begins now. Once it's approved,`);
    console.log(`run /gps write to save the resume to ${path.join(session.grillDir, 'resume.md')}, then /gps plan.`);
  }
}

runCli(() => {
  const featureName = process.argv.slice(2).join(' ').trim();
  if (!featureName) {
    throw new GpsError('Missing feature name.', 'Usage: /gps start <feature-name>');
  }
  startSession(featureName);
});
```

(The header doc comment and the `#!/usr/bin/env node` line stay as they are.)

- [ ] **Step 5: Create `scripts/issue-session.js`**

```js
#!/usr/bin/env node

/**
 * /gps issue <title>
 *
 * Like /gps start, for something reported rather than designed: creates the
 * same session (directory, scratch dir, current-session pointer) with
 * `kind: "issue"` in .session-config.json. On a GitHub project the grill
 * write (write-apply.js) then files the GitHub issue from the resume; with
 * github.enabled false in .work/gps-config.json this is a local session and
 * a warning says so.
 */

const path = require('path');
const { githubEnabled } = require('./lib/project-config');
const { initSession, announceSession } = require('./lib/session-init');
const { GpsError, runCli } = require('./lib/guard');

runCli(() => {
  const title = process.argv.slice(2).join(' ').trim();
  if (!title) {
    throw new GpsError('Missing issue title.', 'Usage: /gps issue <title>');
  }

  const projectRoot = process.cwd();
  const enabled = githubEnabled(projectRoot); // before creating anything, so a corrupt config aborts cleanly

  const session = initSession(projectRoot, title, { kind: 'issue' });
  announceSession(session);

  if (!enabled) {
    console.error('⚠️  GitHub is not enabled for this project: this is a local session, no issue will be created.');
    console.error('   (Set github.enabled to true in .work/gps-config.json to change that.)');
  }
  console.log(`\nNext: the brainstorming conversation begins now, framed as a report (problem, reproduction, expected result).`);
  console.log(`Once it's approved, run /gps write to save the resume to ${path.join(session.grillDir, 'resume.md')}${enabled ? ' and file the GitHub issue' : ''}.`);
});
```

- [ ] **Step 6: Create `skills/gps/references/issue.md`**

````markdown
# /gps issue <title>

**When:** Reporting a problem (bug, regression, small request) you also want to work on, instead of `/gps start`. On a GitHub project the report becomes a GitHub issue.

**Run:** `node $CLAUDE_PLUGIN_ROOT/scripts/issue-session.js "<title>"`

**What it does:**

1. Same setup as `/gps start`: session directory `.work/sessions/YYYY-MM-DD__<slug>/`, scratch directory, `.current-session`. `.session-config.json` gets `kind: "issue"`. **If the session already exists, it fails and changes nothing.**
2. Checks the project's GitHub flag (`.work/gps-config.json`). When it is off, the handler prints a `⚠️` that this is a local session and no issue will be created: relay it. The rest works as for `/gps start`.
3. Immediately invokes the `brainstorming` skill, framed as a report: Problem Statement is the report, "Current behavior" the reproduction, Success Metrics the expected result. Do not wait for the user to run `/brainstorming` themselves.

**Then, as for `/gps start`:** once the design is approved, save the resume by following `references/write.md`. On a GitHub project that write also files the GitHub issue from the resume and prints `📌 Issue #N: <url>`: relay it. If it fails with `gh issue create failed`, nothing was written: relay the reason and run write-apply again after the user fixes it.

- **Bounded work** (no plan): implement directly on the checked-out branch. No branch, no PR. Put the issue number in commit messages (`fix: handle large saves (#N)`). Before `/gps finish`, ask the user "Close issue #N as well?" and run finish with `--close-issue` only on yes (see `references/finish.md`). Finish comments a summary on the issue either way.
- **Planned work:** run `/gps plan` as usual. The plan write creates the session branch and `/gps finish` opens a PR that says `Closes #N`, so merging it closes the issue. Do not pass `--close-issue`.

**Example:**

```
/gps issue crash when saving a large file
```

## Dependency

`brainstorming` (superpowers) runs the grill conversation. If it isn't available, stop and tell the user to install the `superpowers` plugin.
````

- [ ] **Step 7: Register the command in `skills/gps/SKILL.md`**

1. In the front-matter `description`, change `/gps start, /gps status,` to `/gps start, /gps issue, /gps status,`.
2. After the line ``- `/gps start <feature-name>` — Begin a new feature`` add:
   ``- `/gps issue <title>` — Report a problem as a GitHub issue (local session without GitHub) and work on it``
3. Replace the sentence `On GitHub projects, saving the grill resume creates the session's branch and \`/gps finish\` opens its pull request.` with `On GitHub projects (flag in \`.work/gps-config.json\`), saving the plan creates the session's branch and \`/gps finish\` opens its pull request; bounded work gets neither, and \`/gps issue\` files a GitHub issue at the grill write.`
4. In the last "Rules" bullet, change `re-running \`/gps start\`, \`/gps plan\`, \`/gps ticket\` or \`/gps finish\`` to `re-running \`/gps start\`, \`/gps issue\`, \`/gps plan\`, \`/gps ticket\` or \`/gps finish\``.

- [ ] **Step 8: Run the tests**

Run: `node scripts/handlers.test.js`
Expected: `handlers.test.js: all assertions passed`

Run: `npm test`
Expected: exit 0 (existing `/gps start` tests prove the refactor kept behaviour; `github-flow.test.js` still passes).

- [ ] **Step 9: Commit**

```bash
git add scripts skills
git commit -m "feat: /gps issue command with session setup shared with /gps start"
```

---

### Task 5: File the GitHub issue at the grill write

**Files:**
- Modify: `scripts/write-apply.js`, `scripts/lib/status.js`, `scripts/handlers.test.js`, `scripts/github-flow.test.js`, `docs/superpowers/specs/2026-09-25-github-config-issue-design.md`

**Interfaces:**
- Consumes: `createIssue`, `buildIssueBody` (Task 1); `githubEnabled` (Task 2); `config.kind` (Task 4).
- Produces: after a grill write of a `kind: "issue"` session with `github.enabled` true, `.session-config.json` has `issue: { number, url, created_at }`; output has `📌 Issue #N: <url>`; `summarizeSession` returns `issueUrl` (string or `null`).

- [ ] **Step 1: Write the failing tests**

In `scripts/github-flow.test.js`, insert this block immediately before the line `fs.rmSync(tmp, { recursive: true, force: true });`:

```js
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
assert.strictEqual(
  JSON.parse(ok('status.js').out).sessions.find((s) => s.sessionId === sessionId).issueUrl,
  'https://github.com/acme/app/issues/34'
);

```

In `scripts/handlers.test.js`, insert this block right after the `/gps issue` block added in Task 4 (before the router block):

```js
{
  // issue session with GitHub off: the grill write files no issue and still succeeds
  const root = tempProject();
  run(root, 'issue-session.js', 'Local report');
  const target = JSON.parse(run(root, 'write-target.js').out);
  fs.writeFileSync(target.payloadPath, target.sections.map((h) => `## ${h}\n\n${h}: approved.\n`).join('\n'));
  const applied = run(root, 'write-apply.js');
  assert.strictEqual(applied.code, 0, applied.err);
  assert.doesNotMatch(applied.out, /Issue #/);
  const config = JSON.parse(fs.readFileSync(path.join(sessionsDir(root), currentSession(root), '.session-config.json'), 'utf-8'));
  assert.strictEqual(config.issue, undefined);
}

```

- [ ] **Step 2: Run to verify failure**

Run: `node scripts/github-flow.test.js`
Expected: FAIL at `assert.strictEqual(res.code, 1)` (the first `write-apply.js` succeeds without calling gh, because issue creation is not implemented).

- [ ] **Step 3: Implement in `scripts/write-apply.js`**

1. Header comment: after the "Plan phase in a GitHub project" paragraph add:

```
 * Grill phase of a `kind: "issue"` session (/gps issue) in a GitHub project:
 * also files the GitHub issue from the resume sections and records it in
 * .session-config.json as `issue`. If gh fails nothing is written.
```

2. Extend the github import:

```js
const { validateBranchName, createSessionBranch, createIssue, buildIssueBody } = require('./lib/github');
```

3. After the `if (branch !== null) errors.push(...validateBranchName(projectRoot, branch));` line add:

```js
  const issueWanted = target === 'grill' && config.kind === 'issue' && !config.issue && githubEnabled(projectRoot);
```

4. After the `// The branch is created first: ...` block (the `let gitInfo = null; if (branch) { ... }` block), add:

```js
  // Same rule for the issue: if gh refuses, nothing is written.
  let issue = null;
  if (issueWanted) {
    try {
      issue = createIssue(projectRoot, { title: config.feature_name, body: buildIssueBody(payload.sections, sessionId) });
    } catch (err) {
      throw new GpsError(`${err.message} (nothing was written).`,
        `Fix the problem (check that gh is installed and logged in) and run write-apply.js again.`);
    }
  }
```

5. Replace the grill block (from Task 3) with:

```js
  if (target === 'grill') {
    if (issue) {
      config.issue = issue;
      writeJsonAtomic(configPath, config);
    }
    fs.unlinkSync(payloadPath);
    console.log(`✅ Grill written for ${sessionId}. Next: /gps plan`);
    if (issue) console.log(`📌 Issue #${issue.number}: ${issue.url}`);
    return;
  }
```

- [ ] **Step 4: `issueUrl` in `scripts/lib/status.js`**

In `summarizeSession`, after the `prUrl` line add:

```js
    issueUrl: config && config.issue ? config.issue.url || null : null,
```

- [ ] **Step 5: Align the spec with what the body contains**

In `docs/superpowers/specs/2026-09-25-github-config-issue-design.md` replace
`- Body: the resume's Problem Statement, Current behavior and Success Metrics,\n  the \`gps session: <id>\` line and the attribution line.` with
`- Body: the resume's Problem Statement, Context & Constraints (which holds the\n  current behavior) and Success Metrics sections, the \`gps session: <id>\` line\n  and the attribution line.`

- [ ] **Step 6: Run the tests**

Run: `node scripts/github-flow.test.js`
Expected: `# github-flow.test.js: all assertions passed`

Run: `npm test`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add scripts docs
git commit -m "feat(issue): file the GitHub issue at the grill write"
```

---

### Task 6: Finish an issue session (comment / close / `Closes #N`)

**Files:**
- Modify: `scripts/finish.js`, `skills/gps/references/finish.md`, `scripts/github-flow.test.js`

**Interfaces:**
- Consumes: `commentOnIssue`, `closeIssue` (Task 1); `config.issue`, `config.git`; `readRecentCommits(projectRoot, sinceIso, max)` from `scripts/lib/git.js`.
- Produces:
  - `finish.js [--close-issue]`: for a session with `config.issue` and **no** `config.git` (bounded) it comments a summary (once: `config.issue.commented = true` is saved right after success) and, with `--close-issue`, closes the issue (`config.issue.closed = true`). With `config.git` the PR body gets `Closes #N` and nothing is commented or closed. `--close-issue` on any other session prints a `⚠️` and is ignored.
  - `INDEX.md` gets an `## Issue` section for sessions with `config.issue`.

- [ ] **Step 1: Write the failing tests**

In `scripts/github-flow.test.js`:

1. After the `commit` helper add:

```js
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
```

2. Insert this block immediately before the line `fs.rmSync(tmp, { recursive: true, force: true });`:

```js
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

// ------------------------------- E. bounded issue session, closed with the flag
({ sessionId, sessionDir, configPath } = startIssueSession('Typo in footer', 'The footer says "Copyrigth".'));
const typoIssue = readConfig(configPath).issue.number;
commit('footer.js', 'fix: footer typo');
res = ok('finish.js', '--close-issue');
assert.match(res.out, new RegExp(`Issue #${typoIssue} closed`));
assert.deepStrictEqual(issueCalls('close').pop().args, ['issue', 'close', String(typoIssue)]);
assert.strictEqual(readConfig(configPath).issue.closed, true);
assert.match(fs.readFileSync(path.join(sessionDir, 'INDEX.md'), 'utf-8'), /Closed:\*\* yes/);

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

```

- [ ] **Step 2: Run to verify failure**

Run: `node scripts/github-flow.test.js`
Expected: FAIL at `assert.match(res.out, /Summary posted on issue #34/)` (finish does nothing for issues yet).

- [ ] **Step 3: Implement in `scripts/finish.js`**

1. Header comment: after the paragraph ending `list the commands to run by hand.` (and the "Bounded sessions have no branch" sentence from Task 3) add:

```
 *
 * Sessions filed with /gps issue (`issue` in the config): without a branch
 * (bounded), finish comments a summary on the GitHub issue and, with
 * `--close-issue`, closes it. With a branch, the PR body says "Closes #N"
 * and merging the PR closes the issue. A failed gh call never fails finish.
```

2. Imports: replace

```js
const {
  PR_ATTRIBUTION, currentBranch, branchType, commitsBetween, hasUncommittedChanges, openPullRequest,
} = require('./lib/github');
```

with

```js
const {
  PR_ATTRIBUTION, currentBranch, branchType, commitsBetween, hasUncommittedChanges, openPullRequest,
  commentOnIssue, closeIssue,
} = require('./lib/github');
const { readRecentCommits } = require('./lib/git');
```

3. Change the `buildIndex` signature and body. Replace `function buildIndex(config, finishedAt, tickets, bounded, pr) {` with `function buildIndex(config, finishedAt, tickets, bounded, pr, issueResult) {` and replace the line `  if (config.git) lines.push(...branchSection(config.git, pr));` with:

```js
  if (config.git) lines.push(...branchSection(config.git, pr));
  if (config.issue) lines.push(...issueSection(config, issueResult));
```

4. After `branchSection` add:

```js
function issueSection(config, result) {
  const lines = ['## Issue', '', `- **Issue:** ${config.issue.url}`];
  if (config.git) {
    lines.push('- **Closed by:** the pull request, when it is merged', '');
    return lines;
  }
  lines.push(
    `- **Summary comment:** ${result.commented ? 'posted' : 'not posted'}`,
    `- **Closed:** ${result.closed ? 'yes' : 'no'}`
  );
  if (result.failures.length > 0) {
    lines.push('', 'Run by hand:', '', '```bash', ...result.failures.flatMap((f) => f.commands), '```');
  }
  lines.push('');
  return lines;
}
```

5. In `buildPrBody`, after the summary lines, add the `Closes` line. Replace

```js
    problemStatement(sessionDir) || config.feature_name,
    '',
    '## Tickets',
```

with

```js
    problemStatement(sessionDir) || config.feature_name,
    '',
    ...(config.issue ? [`Closes #${config.issue.number}`, ''] : []),
    '## Tickets',
```

6. After `openSessionPr` add:

```js
function buildIssueComment(projectRoot, sessionDir, config) {
  const commits = readRecentCommits(projectRoot, config.created_at, 50);
  return [
    '## Session finished',
    '',
    problemStatement(sessionDir) || config.feature_name,
    '',
    '## Commits',
    '',
    ...(commits.length > 0 ? commits.map((c) => `- ${c}`) : ['None.']),
    '',
    `gps session: \`${config.session_id}\``,
    '',
    PR_ATTRIBUTION,
    '',
  ].join('\n');
}

// Bounded issue session: comments once and (on request) closes the issue.
// Each success is saved at once, so an interrupted finish never repeats it.
// Returns { commented, closed, failures: [{ step, reason, commands }] }.
function wrapUpIssue(projectRoot, sessionDir, configPath, config, close) {
  const issue = config.issue;
  const result = { commented: Boolean(issue.commented), closed: Boolean(issue.closed), failures: [] };

  if (!result.commented) {
    const commented = commentOnIssue(projectRoot, issue.number, buildIssueComment(projectRoot, sessionDir, config));
    if (commented.ok) {
      issue.commented = true;
      result.commented = true;
      writeJsonAtomic(configPath, config);
    } else {
      result.failures.push({ step: 'comment', ...commented });
    }
  }
  if (close && !result.closed) {
    const closed = closeIssue(projectRoot, issue.number);
    if (closed.ok) {
      issue.closed = true;
      result.closed = true;
      writeJsonAtomic(configPath, config);
    } else {
      result.failures.push({ step: 'close', ...closed });
    }
  }
  return result;
}
```

7. In `finishSession`, right after `const projectRoot = process.cwd();` and `let pr = null;` add:

```js
  const closeRequested = process.argv.slice(2).includes('--close-issue');
  const boundedIssue = Boolean(config.issue) && !config.git;
```

After the closing brace of the `if (config.git) { ... }` block and before `const finishedAt = ...` add:

```js
  let issueResult = null;
  if (boundedIssue) {
    issueResult = wrapUpIssue(projectRoot, sessionDir, configPath, config, closeRequested);
  } else if (closeRequested) {
    console.error(`⚠️  --close-issue ignored: ${config.issue
      ? 'the pull request closes the issue when it is merged.'
      : 'this session has no GitHub issue.'}`);
  }
```

Change the INDEX write to pass it: `buildIndex(config, finishedAt, tickets, bounded, pr, issueResult)`.

After the PR output block (`} else if (pr) { ... }`) and before `const unfinished = ...` add:

```js
  if (issueResult) {
    const number = config.issue.number;
    if (issueResult.commented) console.log(`💬 Summary posted on issue #${number}: ${config.issue.url}`);
    if (issueResult.closed) console.log(`✅ Issue #${number} closed`);
    for (const failure of issueResult.failures) {
      console.error(`⚠️  Issue #${number}: ${failure.step} failed (${failure.reason}). Run by hand:`);
      for (const command of failure.commands) console.error(`   ${command}`);
    }
  }
```

- [ ] **Step 4: Update `skills/gps/references/finish.md`**

1. Change the **Run** line to:
`**Run:** \`node $CLAUDE_PLUGIN_ROOT/scripts/finish.js\` (add \`--close-issue\` only as described in step 3)`
2. In step 2, replace `(\`git\` in \`.session-config.json\`, set by \`/gps write\` on the grill phase)` with `(\`git\` in \`.session-config.json\`, set by \`/gps write\` on the plan phase; bounded sessions have none and open no PR)`. Also append to step 2: ` For an issue session the PR body says \`Closes #N\`.`
3. Insert a new step after step 2 and renumber the following steps (3→4 … 6→7):

```
3. **Issue sessions without a branch** (`issue` in `.session-config.json`, bounded work): **before running finish**, ask the user "Close issue #N as well?". Run `finish.js --close-issue` only on yes. Finish posts a summary comment on the issue (`💬`) and, with the flag, closes it (`✅`). If gh fails it still succeeds and prints `⚠️` with the commands to run by hand: relay them, don't retry. Never pass the flag for a session with a branch: its PR closes the issue when merged.
```

4. In (renumbered) step 4, append ` plus an \`## Issue\` section for issue sessions`. In step 5 change `(and \`git.pr_url\`)` to `(and \`git.pr_url\`, \`issue.commented\` / \`issue.closed\`)`.

- [ ] **Step 5: Run the tests**

Run: `node scripts/github-flow.test.js`
Expected: `# github-flow.test.js: all assertions passed`

Run: `npm test`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add scripts skills
git commit -m "feat(finish): comment on, close or link the issue of an /gps issue session"
```

---

### Task 7: Documentation

**Files:**
- Modify: `README.md`, `CLAUDE.md`, `skills/gps/references/status.md`, `docs/TUTORIAL.md` (only if it mentions grill-time branches)

**Interfaces:** none (docs only).

- [ ] **Step 1: README — commands list**

In `README.md`, after the line ``- `/gps start <feature>` — Begin a feature`` add:
``- `/gps issue <title>` — Report a problem as a GitHub issue (local session without GitHub) and work on it``
and change `` - `/gps finish` — Archive session (and open the session's pull request on GitHub projects) `` to `` - `/gps finish` — Archive session (open the pull request of a planned session, or comment on / close the issue of a bounded `/gps issue` session) ``.

- [ ] **Step 2: README — replace the "Branches and Pull Requests" section**

Replace the whole `## Branches and Pull Requests` section (up to, not including, `## Features`) with:

````markdown
## Project config

The first gps command in a project writes `.work/gps-config.json`:

```json
{ "version": 1, "github": { "enabled": true, "detected_at": "2026-09-25T09:00:00.000Z" } }
```

`github.enabled` is true when `origin` is on github.com **and** `gh auth status` succeeds. It is detected once and only read afterwards. Edit the file by hand to force GitHub features on or off (GitHub Enterprise, a `gh auth login` done later, opting out). It lives under `.work/`, so it is per checkout.

## Branches and Pull Requests

When `github.enabled` is true, **planned** sessions get their own branch and end with a pull request:

- **`/gps write` (plan phase)** asks for a `**Branch:**` name shaped like `<feat|fix|refactor|docs|chore|perf|test>/<short-slug>` (e.g. `feat/dark-mode-toggle`), which Claude picks from the approved plan. The branch is created from whatever is checked out (uncommitted changes come along), and that branch becomes the PR's base.
- **Bounded sessions** (grill only, no plan) create no branch and open no PR: the work lands on the branch you already have checked out.
- **`/gps finish`** must run on the session branch. It pushes it (`git push -u origin <branch>`) and runs `gh pr create` against the base branch, with the resume's problem statement, the tickets and the commits as the PR body. The PR link goes into `INDEX.md` (`## Branch & PR`), `.session-config.json` (`git.pr_url`) and `/gps status`.
- If the push or `gh` fails (not installed, not logged in), the session still finishes and `INDEX.md` lists the commands to run by hand.

Projects with `github.enabled` false work exactly as before: no branch, no PR.

## Issues

`/gps issue <title>` starts a session like `/gps start`, framed as a report (problem, reproduction, expected result). On a GitHub project, `/gps write` on the grill phase files the GitHub issue from the resume and records it in `.session-config.json` (`issue`) and `/gps status`.

- **Bounded work:** no branch, no PR. Reference the issue in your commits. `/gps finish` comments a summary on the issue; Claude asks whether to close it too and passes `--close-issue` on yes.
- **Planned work:** `/gps plan` as usual. The plan write creates the branch and `/gps finish` opens a PR that says `Closes #N`, so merging it closes the issue.
- With `github.enabled` false it is a local session: same grill, no issue.
````

- [ ] **Step 3: CLAUDE.md**

In `CLAUDE.md`:

1. After ``- `/gps start <feature-name>` — Create new session directory + initialize templates`` add ``- `/gps issue <title>` — Like start, for a report: on GitHub projects the grill write files a GitHub issue``.
2. In the architecture tree, after the `│   ├── start-session.js     ← Creates .work/sessions/YYYYMMDD__feature/` line add `│   ├── issue-session.js     ← /gps issue: same setup as start, marked kind "issue"`, and change `Shared helpers (session-store, templates, write-target, write-payload, ticket-queue, github) + tests` to `Shared helpers (session-store, session-init, project-config, templates, write-target, write-payload, ticket-queue, github) + tests`.
3. In the "Session Structure" tree, change the `.session-config.json` comment to `← Machine state (session ID, status, tickets, `kind`, and `git` branch/PR / `issue` on GitHub projects)`, and after the closing fence of that tree add the paragraph:
   `Project-wide, \`.work/gps-config.json\` holds the GitHub flag (\`github.enabled\`, detected once by the first command, editable by hand); handlers read it via \`scripts/lib/project-config.js\` and never re-detect.`

- [ ] **Step 4: status reference**

In `skills/gps/references/status.md`, change ``its feature name, creation date, `finishedAt`, `branch` and `prUrl` (GitHub sessions; `null` otherwise)`` to ``its feature name, creation date, `finishedAt`, `branch`, `prUrl` and `issueUrl` (GitHub sessions; `null` otherwise)`` and ``plus its branch and PR link when set`` to ``plus its branch, PR link and issue link when set``.

- [ ] **Step 5: Look for stale grill-time-branch wording**

Run: `grep -rn -i "grill" README.md CLAUDE.md docs/TUTORIAL.md skills | grep -i "branch"`
Expected: no line still saying the branch is created at the grill write. Fix any that remain (only wording, e.g. "saving the grill resume creates the branch" → "saving the plan creates the branch").

- [ ] **Step 6: Full verification**

Run: `npm test`
Expected: exit 0, every test file passes.

Run: `git status --short` — Expected: only the files listed in this task are modified.

- [ ] **Step 7: Commit**

```bash
git add README.md CLAUDE.md skills docs
git commit -m "docs: project config, plan-time branches and /gps issue"
```
