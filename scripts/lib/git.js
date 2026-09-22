// scripts/lib/git.js
const path = require('path');
const { execSync } = require('child_process');

function readRecentCommits(projectRoot, sessionDir) {
  const relPath = path.relative(projectRoot, sessionDir).replace(/\\/g, '/');
  try {
    const output = execSync(`git log --oneline -n 5 -- "${relPath}"`, {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output.split('\n').map((line) => line.trim()).filter(Boolean);
  } catch (_err) {
    return [];
  }
}

function readGitStatusSummary(projectRoot, sessionDir) {
  const relPath = path.relative(projectRoot, sessionDir).replace(/\\/g, '/');
  try {
    const output = execSync('git status --porcelain --untracked-files=all', {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => ({
        indexStatus: line[0],
        worktreeStatus: line[1],
        path: line.slice(3),
      }))
      .filter((entry) => entry.path.startsWith(relPath + '/') || entry.path === relPath);
  } catch (_err) {
    return [];
  }
}

module.exports = { readRecentCommits, readGitStatusSummary };
