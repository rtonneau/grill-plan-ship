// skills/gps/scripts/lib/github.js
//
// GitHub support through the gh CLI: detection for .work/gps-config.json,
// pull requests (/gps finish) and issues (/gps start --issue). gh always
// runs via execFileSync with an argument array (never a shell string); git
// itself is in git.js.
//
// GPS_GH_BIN overrides the gh executable (tests point it at a stub .js
// script, which is run with node).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { failureReason, isWorkTree, originUrl, pushBranch } = require('./git');

const PR_ATTRIBUTION = '🤖 Generated with [grill-plan-ship](https://github.com/rtonneau/grill-plan-ship)';
const ISSUE_SECTIONS = ['Problem Statement', 'Context & Constraints', 'Success Metrics'];
const ISSUE_URL_RE = /^https:\/\/\S+\/issues\/(\d+)$/;

function isGithubUrl(url) {
  return typeof url === 'string'
    && /^(https?:\/\/([^@/]+@)?github\.com[/:]|git@github\.com:|ssh:\/\/git@github\.com[/:])/i.test(url.trim());
}

function ghCommand() {
  const override = process.env.GPS_GH_BIN;
  if (!override) return { file: 'gh', prefix: [] };
  return override.endsWith('.js') ? { file: process.execPath, prefix: [override] } : { file: override, prefix: [] };
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

// { enabled, reason }: enabled when origin is on github.com and gh is
// logged in. Reads the configured origin URL (not `remote get-url`, which
// applies insteadOf rewrites), so a rewritten github.com origin still counts.
function diagnoseGithub(projectRoot) {
  if (!isWorkTree(projectRoot)) return { enabled: false, reason: 'not a git repository' };
  const origin = originUrl(projectRoot);
  if (!origin) return { enabled: false, reason: 'no "origin" remote' };
  if (!isGithubUrl(origin)) return { enabled: false, reason: `origin is not on github.com (${origin})` };
  if (!ghAuthenticated(projectRoot)) {
    return { enabled: false, reason: 'origin is on github.com, but gh is not authenticated (run gh auth login)' };
  }
  return { enabled: true, reason: 'origin is on github.com and gh is authenticated' };
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

function pullNumber(url) {
  const match = /\/pull\/(\d+)/.exec(String(url));
  return match ? Number(match[1]) : null;
}

// Details of an existing PR through `gh pr view`: { number, title, head,
// base }. Never throws: when gh fails or prints no usable JSON, the number
// comes from the URL and title/head/base are null.
function viewPullRequest(projectRoot, url) {
  const fallback = { number: pullNumber(url), title: null, head: null, base: null };
  try {
    const view = JSON.parse(runGh(projectRoot, [
      'pr', 'view', url, '--json', 'number,title,headRefName,baseRefName,url',
    ]));
    return {
      number: Number.isInteger(view.number) ? view.number : fallback.number,
      title: typeof view.title === 'string' && view.title ? view.title : null,
      head: typeof view.headRefName === 'string' && view.headRefName ? view.headRefName : null,
      base: typeof view.baseRefName === 'string' && view.baseRefName ? view.baseRefName : null,
    };
  } catch (_err) {
    return fallback;
  }
}

// One-line description of an opened PR, shared by the finish output and
// INDEX.md, without the "Pull request" label and the URL: "#12 (new): <title>
// (<head> → <base>)", or "#12 (already open, updated by the push)" when the
// title is unknown.
function describePullRequest(pr) {
  const status = pr.existing ? 'already open, updated by the push' : 'new';
  const head = `${pr.number ? `#${pr.number} ` : ''}(${status})`;
  if (!pr.title) return head;
  const branches = pr.head && pr.base ? ` (${pr.head} → ${pr.base})` : '';
  return `${head}: ${pr.title}${branches}`;
}

// Pushes the session branch and opens a PR, unless one is already known
// (`gitInfo.pr_url`, saved by an earlier finish) or already open for the
// branch: then the push just updates it. Never throws: returns
// { ok: true, url, existing, number, title, head, base } (an existing PR's
// details come from `gh pr view`, null when it fails) or
// { ok: false, step, reason, commands }.
function openPullRequest(projectRoot, gitInfo, { title, body }) {
  const commands = [
    `git push -u origin ${gitInfo.branch}`,
    `gh pr create --base ${gitInfo.base_branch} --head ${gitInfo.branch} --title "${title.replace(/"/g, '\\"')}" --fill`,
  ];
  const pushed = pushBranch(projectRoot, gitInfo.branch);
  if (!pushed.ok) return { ok: false, step: 'push', reason: pushed.reason, commands };

  const existingUrl = gitInfo.pr_url || findOpenPullRequest(projectRoot, gitInfo.branch);
  if (existingUrl) return { ok: true, url: existingUrl, existing: true, ...viewPullRequest(projectRoot, existingUrl) };

  return withBodyFile(body, (bodyFile) => {
    try {
      const url = lastUrl(runGh(projectRoot, [
        'pr', 'create',
        '--base', gitInfo.base_branch, '--head', gitInfo.branch,
        '--title', title, '--body-file', bodyFile,
      ]));
      if (!url) return { ok: false, step: 'gh', reason: 'gh printed no PR URL', commands: commands.slice(1) };
      return {
        ok: true, url, existing: false,
        number: pullNumber(url), title, head: gitInfo.branch, base: gitInfo.base_branch,
      };
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

// True when `gh release view <tag>` succeeds (any failure counts as none).
function releaseExists(projectRoot, tag) {
  try {
    runGh(projectRoot, ['release', 'view', tag]);
    return true;
  } catch (_err) {
    return false;
  }
}

// Never throws: { ok: true, url } (url null when gh prints none) or
// { ok: false, reason, commands, notesFile }. On failure the notes file (in
// the OS temp dir) is kept, so the by-hand command publishes the real notes.
function createRelease(projectRoot, { tag, title, notes }) {
  const notesFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gps-release-')), 'notes.md');
  try {
    fs.writeFileSync(notesFile, notes);
    const url = lastUrl(runGh(projectRoot, ['release', 'create', tag, '--title', title, '--notes-file', notesFile]));
    fs.rmSync(path.dirname(notesFile), { recursive: true, force: true });
    return { ok: true, url };
  } catch (err) {
    const quoted = (text) => `"${String(text).replace(/"/g, '\\"')}"`;
    return {
      ok: false, reason: failureReason(err), notesFile,
      commands: [`gh release create ${tag} --title ${quoted(title)} --notes-file ${quoted(notesFile)}`],
    };
  }
}

module.exports = {
  PR_ATTRIBUTION,
  isGithubUrl,
  ghAuthenticated,
  diagnoseGithub,
  openPullRequest,
  describePullRequest,
  buildIssueBody,
  createIssue,
  commentOnIssue,
  closeIssue,
  releaseExists,
  createRelease,
};
