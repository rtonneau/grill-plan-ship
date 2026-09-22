// scripts/lib/git.js
//
// Read-only git queries. Git is always run via execFileSync with an
// argument array (never a shell string), so paths and session names can't
// be interpreted by a shell. Every helper returns [] on any error (not a
// repo, git missing, ...) and never throws.

const path = require('path');
const { execFileSync } = require('child_process');

const DEFAULT_MAX_COMMITS = 10;

function git(projectRoot, args) {
  return execFileSync('git', args, {
    cwd: projectRoot,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

// Project-wide commits (oneline) made since `sinceIso` (the session's
// created_at), newest first. With no sinceIso, the latest commits.
function readRecentCommits(projectRoot, sinceIso, max = DEFAULT_MAX_COMMITS) {
  const args = ['log', '--oneline', '-n', String(max)];
  const sinceMs = sinceIso ? Date.parse(sinceIso) : NaN;
  // "@<unix seconds>" is git's unambiguous raw date format.
  if (!Number.isNaN(sinceMs)) args.push(`--since=@${Math.floor(sinceMs / 1000)}`);
  try {
    return git(projectRoot, args).split('\n').map((line) => line.trim()).filter(Boolean);
  } catch (_err) {
    return [];
  }
}

function parsePorcelain(output) {
  return output
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => ({
      indexStatus: line[0],
      worktreeStatus: line[1],
      path: line.slice(3),
    }));
}

// `git status --porcelain` for the whole project, or only `pathspec`
// (relative to projectRoot) when given.
function readGitStatusEntries(projectRoot, pathspec) {
  const args = ['status', '--porcelain', '--untracked-files=all'];
  if (pathspec) args.push('--', pathspec);
  try {
    return parsePorcelain(git(projectRoot, args));
  } catch (_err) {
    return [];
  }
}

// Session-scoped status only (kept for callers that want just that).
function readGitStatusSummary(projectRoot, sessionDir) {
  const relPath = path.relative(projectRoot, sessionDir).replace(/\\/g, '/');
  return readGitStatusEntries(projectRoot, relPath);
}

// Both views, shown separately: the whole project (where code changes
// live) and the session directory (usually empty, as .work/ is gitignored).
function readGitStatus(projectRoot, sessionDir) {
  return {
    project: readGitStatusEntries(projectRoot, null),
    session: readGitStatusSummary(projectRoot, sessionDir),
  };
}

module.exports = { DEFAULT_MAX_COMMITS, readRecentCommits, readGitStatusSummary, readGitStatus };
