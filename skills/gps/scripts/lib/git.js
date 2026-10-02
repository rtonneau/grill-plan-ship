// skills/gps/scripts/lib/git.js
//
// Every git call the scripts make. Git always runs via execFileSync with an
// argument array (never a shell string), so paths and names can't be
// interpreted by a shell. Read helpers return [] / null on any error (not a
// repo, git missing, ...); write helpers return { ok, reason, commands }
// so a caller can print the commands to run by hand, except where noted.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DEFAULT_MAX_COMMITS = 10;
const BRANCH_TYPES = ['feat', 'fix', 'refactor', 'docs', 'chore', 'perf', 'test'];
const BRANCH_RE = new RegExp(`^(${BRANCH_TYPES.join('|')})/[a-z0-9]+([._-][a-z0-9]+)*$`);
const MAX_BRANCH_LENGTH = 80;
const BRANCH_PATTERN = `<${BRANCH_TYPES.join('|')}>/<short-slug>`;

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

// Local branches whose tip holds `relPath` (e.g. a session committed on a
// branch that is not checked out).
function branchesHolding(projectRoot, relPath) {
  return lines(tryGit(projectRoot, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']))
    .filter((branch) => tryGit(projectRoot, ['cat-file', '-e', `${branch}:${relPath}`]) !== null);
}

// Short, readable reason from a failed execFileSync.
function failureReason(err) {
  const stderr = err && err.stderr ? String(err.stderr).trim() : '';
  if (stderr) return stderr.split('\n').filter(Boolean).pop();
  return err && err.code === 'ENOENT' ? 'command not found' : (err && err.message) || String(err);
}

const lines = (out) => (out ? out.split('\n').map((l) => l.trim()).filter(Boolean) : []);
const nulList = (out) => (out || '').split('\0').filter(Boolean);
const quote = (text) => `"${String(text).replace(/"/g, '\\"')}"`;

function isWorkTree(projectRoot) {
  return tryGit(projectRoot, ['rev-parse', '--is-inside-work-tree']) === 'true';
}

function originUrl(projectRoot) {
  return tryGit(projectRoot, ['config', '--get', 'remote.origin.url']);
}

function currentBranch(projectRoot) {
  return tryGit(projectRoot, ['branch', '--show-current']) || null;
}

function commitExists(projectRoot, sha) {
  return tryGit(projectRoot, ['cat-file', '-e', `${sha}^{commit}`]) !== null;
}

// "<short sha> <subject>" of a commit, or null when it does not exist.
function describeCommit(projectRoot, sha) {
  return tryGit(projectRoot, ['log', '-1', '--format=%h %s', `${sha}^{commit}`, '--']) || null;
}

// Project-wide commits (oneline) made since `sinceIso` (the session's
// created_at), newest first. With no sinceIso, the latest commits.
function readRecentCommits(projectRoot, sinceIso, max = DEFAULT_MAX_COMMITS) {
  const args = ['log', '--oneline', '-n', String(max)];
  const sinceMs = sinceIso ? Date.parse(sinceIso) : NaN;
  // "@<unix seconds>" is git's unambiguous raw date format.
  if (!Number.isNaN(sinceMs)) args.push(`--since=@${Math.floor(sinceMs / 1000)}`);
  return lines(tryGit(projectRoot, args));
}

function commitsBetween(projectRoot, base, branch) {
  return lines(tryGit(projectRoot, ['log', '--oneline', '--no-decorate', `${base}..${branch}`]));
}

function parsePorcelain(output) {
  return output
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => ({ indexStatus: line[0], worktreeStatus: line[1], path: line.slice(3) }));
}

// `git status --porcelain` for the whole project, or only `pathspec`.
function readGitStatusEntries(projectRoot, pathspec) {
  const args = ['status', '--porcelain', '--untracked-files=all'];
  if (pathspec) args.push('--', pathspec);
  try {
    return parsePorcelain(execFileSync('git', args, {
      cwd: projectRoot, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'],
    }));
  } catch (_err) {
    return [];
  }
}

// Both views: the project's code changes (gps's own .work/ left out, as it
// may or may not be tracked) and the session directory.
function readGitStatus(projectRoot, sessionDir) {
  const relPath = path.relative(projectRoot, sessionDir).replace(/\\/g, '/');
  return {
    project: readGitStatusEntries(projectRoot, null).filter((e) => !e.path.startsWith('.work/')),
    session: readGitStatusEntries(projectRoot, relPath),
  };
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

function branchType(branch) {
  return String(branch).split('/')[0];
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

// Never throws: { ok: true } or { ok: false, reason, commands }.
function switchBranch(projectRoot, name) {
  try {
    git(projectRoot, ['switch', '-q', name]);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: failureReason(err), commands: [`git switch ${name}`] };
  }
}

// True when git ignores `relPath` (e.g. an older .gitignore with ".work/").
function isIgnored(projectRoot, relPath) {
  return tryGit(projectRoot, ['check-ignore', '-q', '--no-index', '--', relPath]) !== null;
}

// Commits every change to tracked files outside .work/ (`git add -u`), so
// /gps finish leaves nothing behind (e.g. a log a hook appends to); .work/
// gets its own commit (commitWorkDir). Untracked files are listed, never
// committed; .work/ is left out of that list. Never throws:
// { ok: true, sha, files, untracked } (sha null: nothing to commit, or not a
// git repo) or { ok: false, reason, commands, untracked }.
function commitRemainingChanges(projectRoot, message) {
  if (!isWorkTree(projectRoot)) return { ok: true, sha: null, files: [], untracked: [] };
  const untracked = nulList(tryGit(projectRoot, ['ls-files', '--others', '--exclude-standard', '-z']))
    .filter((f) => !f.startsWith('.work/'));
  try {
    git(projectRoot, ['add', '-u', '--', '.', ':(exclude).work']);
    const files = nulList(git(projectRoot, ['diff', '--cached', '--name-only', '-z']));
    if (files.length === 0) return { ok: true, sha: null, files, untracked };
    git(projectRoot, ['commit', '-q', '-m', message]);
    return { ok: true, sha: git(projectRoot, ['rev-parse', '--short', 'HEAD']), files, untracked };
  } catch (err) {
    return { ok: false, reason: failureReason(err), untracked, commands: ['git add -u -- . ":(exclude).work"', `git commit -m ${quote(message)}`] };
  }
}

// Commits gps's record (.work/: sessions, glossary, ADRs, project config) as
// its own commit; anything else that is staged stays staged. Files git
// ignores (.current-session, .pending-seeds.json, a write payload) stay out.
// Never throws: { ok: true, sha, files, skipped } (sha null: nothing to
// commit; skipped: why nothing was tried) or { ok: false, reason, commands }.
function commitWorkDir(projectRoot, message) {
  const none = (skipped) => ({ ok: true, sha: null, files: [], skipped });
  if (!isWorkTree(projectRoot)) return none('not a git repository');
  if (!fs.existsSync(path.join(projectRoot, '.work'))) return none(null);
  if (isIgnored(projectRoot, '.work/')) return none('.work/ is git-ignored');
  const commands = ['git add -- .work', `git commit -m ${quote(message)} -- .work`];
  try {
    git(projectRoot, ['add', '-A', '--', '.work']);
    const files = nulList(git(projectRoot, ['diff', '--cached', '--name-only', '-z', '--', '.work']));
    if (files.length === 0) return none(null);
    git(projectRoot, ['commit', '-q', '-m', message, '--', '.work']);
    return { ok: true, sha: git(projectRoot, ['rev-parse', '--short', 'HEAD']), files, skipped: null };
  } catch (err) {
    return { ok: false, reason: failureReason(err), commands };
  }
}

// Stages exactly `files` (paths relative to projectRoot) and commits them
// with `message`; nothing else that is staged goes in. Never throws:
// { ok: true, sha, files } or { ok: false, reason, commands }.
function commitFiles(projectRoot, files, message) {
  const commands = [`git add -- ${files.map(quote).join(' ')}`, `git commit -m ${quote(message)} -- ${files.map(quote).join(' ')}`];
  if (!isWorkTree(projectRoot)) return { ok: false, reason: 'not a git repository', commands };
  try {
    git(projectRoot, ['add', '--', ...files]);
    const staged = nulList(git(projectRoot, ['diff', '--cached', '--name-only', '-z', '--', ...files]));
    if (staged.length === 0) return { ok: false, reason: 'none of the given files has changes to commit', commands };
    git(projectRoot, ['commit', '-q', '-m', message, '--', ...files]);
    return { ok: true, sha: git(projectRoot, ['rev-parse', '--short', 'HEAD']), files: staged };
  } catch (err) {
    return { ok: false, reason: failureReason(err), commands };
  }
}

// What a commitWorkDir result means for the user: { line, warning }, either
// null (nothing to say outside a git repository or with nothing to commit).
function describeWorkCommit(record) {
  if (record.ok && record.sha) {
    return { line: `🗂️  Session record committed (${record.sha}): ${record.files.length} file(s) in .work/`, warning: null };
  }
  if (record.ok) {
    return { line: null, warning: record.skipped === '.work/ is git-ignored' ? 'Session record not committed: .work/ is git-ignored.' : null };
  }
  return { line: null, warning: `Session record not committed (${record.reason}). Run by hand: ${record.commands.join(' && ')}` };
}

// Never throws: { ok: true } or { ok: false, reason }.
function pushBranch(projectRoot, branch) {
  try {
    git(projectRoot, ['push', '-u', 'origin', branch]);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: failureReason(err) };
  }
}

module.exports = {
  DEFAULT_MAX_COMMITS,
  BRANCH_TYPES,
  BRANCH_PATTERN,
  failureReason,
  isWorkTree,
  originUrl,
  currentBranch,
  branchesHolding,
  commitExists,
  describeCommit,
  readRecentCommits,
  commitsBetween,
  readGitStatus,
  validateBranchName,
  branchType,
  createSessionBranch,
  switchBranch,
  isIgnored,
  commitRemainingChanges,
  commitWorkDir,
  describeWorkCommit,
  commitFiles,
  pushBranch,
};
