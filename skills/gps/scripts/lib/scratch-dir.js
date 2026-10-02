// skills/gps/scripts/lib/scratch-dir.js
const fs = require('fs');
const path = require('path');

const SCRATCH_ROOT = ['.scratch', 'tests'];
const GITIGNORE_ENTRY = '.scratch/';

// Creates <projectRoot>/.scratch/tests/<sessionId>/ and returns its
// project-relative path (forward slashes, so it is stable across OSes).
function ensureScratchDir(projectRoot, sessionId) {
  fs.mkdirSync(path.join(projectRoot, ...SCRATCH_ROOT, sessionId), { recursive: true });
  return [...SCRATCH_ROOT, sessionId].join('/');
}

const gitignorePathOf = (projectRoot) => path.join(projectRoot, '.gitignore');
const readGitignore = (projectRoot) => {
  const file = gitignorePathOf(projectRoot);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
};
// A line as gitignore compares it here: no surrounding spaces or slashes.
const bare = (line) => line.trim().replace(/^\//, '').replace(/\/$/, '');

// True when .gitignore has a line for `entry` (same pattern, slashes aside).
function gitignoreCovers(projectRoot, entry) {
  return readGitignore(projectRoot).split(/\r?\n/).map(bare).includes(bare(entry));
}

// Appends `entry` (default ".scratch/") to the project's .gitignore unless
// already covered. Returns true if the file was created or modified.
function ensureGitignoreEntry(projectRoot, entry = GITIGNORE_ENTRY) {
  const gitignorePath = gitignorePathOf(projectRoot);
  const existing = readGitignore(projectRoot);
  if (gitignoreCovers(projectRoot, entry)) return false;

  const separator = existing === '' || existing.endsWith('\n') ? '' : '\n';
  fs.writeFileSync(gitignorePath, existing + separator + entry + '\n');
  return true;
}

// Removes every line for `entry` from .gitignore (the user agreed to it).
// Returns true if a line was removed.
function removeGitignoreEntry(projectRoot, entry) {
  if (!gitignoreCovers(projectRoot, entry)) return false;
  const lines = readGitignore(projectRoot).split(/\r?\n/).filter((line) => bare(line) !== bare(entry));
  fs.writeFileSync(gitignorePathOf(projectRoot), lines.join('\n'));
  return true;
}

module.exports = { ensureScratchDir, gitignoreCovers, ensureGitignoreEntry, removeGitignoreEntry };
