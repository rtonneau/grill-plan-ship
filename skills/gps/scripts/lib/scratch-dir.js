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

// Directories that hold regenerable build output, whatever the toolchain.
const BUILD_DIR_NAMES = ['build', 'build-*', 'build_*', 'node_modules', 'CMakeFiles', '__pycache__', '.venv', 'venv', 'target', 'dist', 'obj', '.gradle', '.cache'];
const CLEAN_POLICIES = ['none', 'build-artifacts', 'all'];

function matchesBuildName(name) {
  return BUILD_DIR_NAMES.some((pattern) => (pattern.endsWith('*') ? name.startsWith(pattern.slice(0, -1)) : name === pattern));
}

// True when the dir is a build tree: a known build name, a name the project
// listed in `extraDirs`, or any dir holding a CMakeCache.txt (CMake, any name).
function isBuildTree(dirPath, name, extraDirs = []) {
  if (matchesBuildName(name) || extraDirs.includes(name)) return true;
  return fs.existsSync(path.join(dirPath, 'CMakeCache.txt'));
}

// Total bytes of all files below `dirPath` (0 when missing); symlinks are not followed.
function dirSize(dirPath) {
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return 0;
  }
  let total = 0;
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) total += dirSize(full);
    else if (entry.isFile()) {
      try {
        total += fs.lstatSync(full).size;
      } catch {
        // vanished between listing and stat: nothing to count
      }
    }
  }
  return total;
}

function formatBytes(n) {
  if (!(n >= 1024)) return `${n > 0 ? n : 0} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = n / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

const defaultRm = (target) => fs.rmSync(target, { recursive: true, force: true });

// Cleans <projectRoot>/.scratch/tests/<sessionId>/ per `policy`:
//   none            removes nothing
//   build-artifacts removes every build tree whole (no descent), keeps all other files
//   all             removes the whole session scratch dir
// Removal errors land in `failures`; this never throws for them. `rm` is injectable for tests.
function cleanScratch(projectRoot, sessionId, { policy = 'none', extraDirs = [], rm = defaultRm } = {}) {
  const result = { policy, removed: [], freedBytes: 0, failures: [] };
  const scratchRel = [...SCRATCH_ROOT, sessionId].join('/');
  const scratchAbs = path.join(projectRoot, ...SCRATCH_ROOT, sessionId);
  if (policy === 'none' || !fs.existsSync(scratchAbs)) return result;

  const remove = (abs, rel) => {
    const size = dirSize(abs);
    try {
      rm(abs);
      result.removed.push(rel);
      result.freedBytes += size;
    } catch (err) {
      result.failures.push({ path: rel, reason: err && err.message ? err.message : String(err) });
    }
  };

  if (policy === 'all') {
    remove(scratchAbs, scratchRel);
    return result;
  }

  const walk = (abs, rel) => {
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch (err) {
      result.failures.push({ path: rel, reason: err.message });
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const childAbs = path.join(abs, entry.name);
      const childRel = `${rel}/${entry.name}`;
      if (isBuildTree(childAbs, entry.name, extraDirs)) remove(childAbs, childRel);
      else walk(childAbs, childRel);
    }
  };
  walk(scratchAbs, scratchRel);
  return result;
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

module.exports = { BUILD_DIR_NAMES, CLEAN_POLICIES, isBuildTree, dirSize, formatBytes, cleanScratch, ensureScratchDir, gitignoreCovers, ensureGitignoreEntry, removeGitignoreEntry };
