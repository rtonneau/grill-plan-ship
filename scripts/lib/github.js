// scripts/lib/github.js
//
// Session branch, pull request and issue support for projects hosted on GitHub.
// /gps write (plan) creates the session's branch; /gps finish pushes it and
// opens a PR against the branch it started from. /gps issue files a GitHub
// issue at the grill write; /gps finish comments on it. Git and gh always run
// via execFileSync with an argument array (never a shell string).
//
// GPS_GH_BIN overrides the gh executable (tests point it at a stub .js
// script, which is run with node).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const BRANCH_TYPES = ['feat', 'fix', 'refactor', 'docs', 'chore', 'perf', 'test'];
const BRANCH_RE = new RegExp(`^(${BRANCH_TYPES.join('|')})/[a-z0-9]+([._-][a-z0-9]+)*$`);
const MAX_BRANCH_LENGTH = 80;
const BRANCH_PATTERN = `<${BRANCH_TYPES.join('|')}>/<short-slug>`;
const PR_ATTRIBUTION = '🤖 Generated with [Claude Code](https://claude.com/claude-code)';
const ISSUE_SECTIONS = ['Problem Statement', 'Context & Constraints', 'Success Metrics'];
const ISSUE_URL_RE = /^https:\/\/\S+\/issues\/(\d+)$/;

function git(projectRoot, args) {
  return execFileSync('git', args, {
    cwd: projectRoot,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function tryGit(projectRoot, args) {
  try {
    return git(projectRoot, args);
  } catch (_err) {
    return null;
  }
}

// Short, readable reason from a failed execFileSync.
function failureReason(err) {
  const stderr = err && err.stderr ? String(err.stderr).trim() : '';
  if (stderr) return stderr.split('\n').filter(Boolean).pop();
  return err && err.code === 'ENOENT' ? 'command not found' : (err && err.message) || String(err);
}

function isGithubUrl(url) {
  return typeof url === 'string'
    && /^(https?:\/\/([^@/]+@)?github\.com[/:]|git@github\.com:|ssh:\/\/git@github\.com[/:])/i.test(url.trim());
}

// True when projectRoot is in a git work tree whose origin is on GitHub.
// Reads the configured URL (not `remote get-url`, which applies insteadOf
// rewrites), so a rewritten github.com origin still counts.
function detectGithub(projectRoot) {
  if (tryGit(projectRoot, ['rev-parse', '--is-inside-work-tree']) !== 'true') return false;
  return isGithubUrl(tryGit(projectRoot, ['config', '--get', 'remote.origin.url']));
}

function currentBranch(projectRoot) {
  return tryGit(projectRoot, ['branch', '--show-current']) || null;
}

// Problems with a proposed session branch name, as payload error strings.
function validateBranchName(projectRoot, name) {
  if (!name) return [`Missing field "**Branch:**": name the session branch ${BRANCH_PATTERN}, e.g. feat/dark-mode-toggle.`];
  const errors = [];
  if (name.length > MAX_BRANCH_LENGTH || !BRANCH_RE.test(name)) {
    errors.push(`Branch "${name}" must look like ${BRANCH_PATTERN} (lowercase a-z 0-9, "-", "_" or "." between, at most ${MAX_BRANCH_LENGTH} characters), e.g. feat/dark-mode-toggle.`);
  } else if (tryGit(projectRoot, ['check-ref-format', '--branch', name]) === null) {
    errors.push(`Branch "${name}" is not a valid git branch name.`);
  } else if (tryGit(projectRoot, ['rev-parse', '--verify', '--quiet', `refs/heads/${name}`]) !== null) {
    errors.push(`Branch "${name}" already exists. Pick another name.`);
  }
  if (!currentBranch(projectRoot)) {
    errors.push('HEAD is detached: check out the branch the session should start from, then run write-apply.js again.');
  }
  return errors;
}

// Creates `name` from HEAD and switches to it (uncommitted changes carry
// over). Returns the config's `git` record. Throws with git's reason.
function createSessionBranch(projectRoot, name) {
  const base = currentBranch(projectRoot);
  try {
    git(projectRoot, ['switch', '-c', name]);
  } catch (err) {
    throw new Error(`git switch -c ${name} failed: ${failureReason(err)}`);
  }
  return { branch: name, base_branch: base, branch_created_at: new Date().toISOString(), pr_url: null };
}

function branchType(branch) {
  return String(branch).split('/')[0];
}

function commitsBetween(projectRoot, base, branch) {
  const out = tryGit(projectRoot, ['log', '--oneline', '--no-decorate', `${base}..${branch}`]);
  return out ? out.split('\n').map((l) => l.trim()).filter(Boolean) : [];
}

function hasUncommittedChanges(projectRoot) {
  const out = tryGit(projectRoot, ['status', '--porcelain', '--untracked-files=no']);
  return Boolean(out);
}

function ghCommand() {
  const override = process.env.GPS_GH_BIN;
  if (!override) return { file: 'gh', prefix: [] };
  return override.endsWith('.js') ? { file: process.execPath, prefix: [override] } : { file: override, prefix: [] };
}

function manualCommands(gitInfo, title) {
  return [
    `git push -u origin ${gitInfo.branch}`,
    `gh pr create --base ${gitInfo.base_branch} --head ${gitInfo.branch} --title "${title.replace(/"/g, '\\"')}" --fill`,
  ];
}

function runGh(projectRoot, args) {
  const gh = ghCommand();
  return execFileSync(gh.file, [...gh.prefix, ...args], {
    cwd: projectRoot, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
  });
}

// True when `gh auth status` succeeds (gh installed and logged in).
function ghAuthenticated(projectRoot) {
  try {
    runGh(projectRoot, ['auth', 'status']);
    return true;
  } catch (_err) {
    return false;
  }
}

function lastUrl(output) {
  return String(output).split('\n').map((l) => l.trim()).filter((l) => /^https:\/\//.test(l)).pop() || null;
}

// Writes `body` to a temp file, runs fn(filePath), always removes the file.
function withBodyFile(body, fn) {
  const bodyFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gps-gh-')), 'body.md');
  try {
    fs.writeFileSync(bodyFile, body);
    return fn(bodyFile);
  } finally {
    fs.rmSync(path.dirname(bodyFile), { recursive: true, force: true });
  }
}

// URL of an open PR whose head is `branch`, or null (none, or gh failed).
function findOpenPullRequest(projectRoot, branch) {
  try {
    return lastUrl(runGh(projectRoot, [
      'pr', 'list', '--head', branch, '--state', 'open', '--json', 'url', '--jq', '.[].url',
    ]));
  } catch (_err) {
    return null;
  }
}

// Pushes the session branch and opens a PR, unless one is already known
// (`gitInfo.pr_url`, saved by an earlier finish) or already open for the
// branch: then the push just updates it. Never throws: returns
// { ok: true, url, existing } or { ok: false, step, reason, commands }.
function openPullRequest(projectRoot, gitInfo, { title, body }) {
  const commands = manualCommands(gitInfo, title);
  try {
    git(projectRoot, ['push', '-u', 'origin', gitInfo.branch]);
  } catch (err) {
    return { ok: false, step: 'push', reason: failureReason(err), commands };
  }

  const existingUrl = gitInfo.pr_url || findOpenPullRequest(projectRoot, gitInfo.branch);
  if (existingUrl) return { ok: true, url: existingUrl, existing: true };

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
  try {
    return withBodyFile(body, (bodyFile) => {
      runGh(projectRoot, ['issue', 'comment', String(number), '--body-file', bodyFile]);
      return { ok: true };
    });
  } catch (err) {
    return { ok: false, reason: failureReason(err), commands: [`gh issue comment ${number} --body "<summary of the work>"`] };
  }
}

function closeIssue(projectRoot, number) {
  try {
    runGh(projectRoot, ['issue', 'close', String(number)]);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: failureReason(err), commands: [`gh issue close ${number}`] };
  }
}

module.exports = {
  BRANCH_TYPES,
  BRANCH_PATTERN,
  PR_ATTRIBUTION,
  isGithubUrl,
  detectGithub,
  currentBranch,
  validateBranchName,
  createSessionBranch,
  branchType,
  commitsBetween,
  hasUncommittedChanges,
  openPullRequest,
  ghAuthenticated,
  buildIssueBody,
  createIssue,
  commentOnIssue,
  closeIssue,
};
