// scripts/lib/scratch-dir.js
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

// Appends ".scratch/" to the project's .gitignore unless already covered.
// Returns true if the file was created or modified.
function ensureGitignoreEntry(projectRoot) {
  const gitignorePath = path.join(projectRoot, '.gitignore');
  const existing = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf-8') : '';

  const covered = existing
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^\//, '').replace(/\/$/, ''))
    .includes('.scratch');
  if (covered) return false;

  const separator = existing === '' || existing.endsWith('\n') ? '' : '\n';
  fs.writeFileSync(gitignorePath, existing + separator + GITIGNORE_ENTRY + '\n');
  return true;
}

module.exports = { ensureScratchDir, ensureGitignoreEntry };
