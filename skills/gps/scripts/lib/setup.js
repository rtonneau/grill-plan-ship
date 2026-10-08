// skills/gps/scripts/lib/setup.js
//
// A project's gps setup (/gps init): the per-machine files git must ignore,
// .work/gps-config.json, the CHANGELOG when missing (changelog enabled), and
// one setup commit holding them. /gps start does
// the file part on its own, so setup stays optional; /gps init adds the
// checks up front and commits the setup on its own, before any session
// branch exists.

const fs = require('fs');
const path = require('path');
const { ensureGitignoreEntry, gitignoreCovers, removeGitignoreEntry } = require('./scratch-dir');
const { CONFIG_FILENAME, readConfig, ensureProjectConfig, changelogSettings } = require('./project-config');
const { NEW_FILE_HEADER } = require('./changelog');
const { diagnoseGithub } = require('./github');
const { isWorkTree, currentBranch, isIgnored, isTracked, pathHasChanges, commitFiles } = require('./git');

// Files under .work/ (and .scratch/) that must never be shared: the
// current session pointer, scouted ideas not started yet (and their
// corrupt backups) and the /gps write and changelog payloads in progress.
const LOCAL_ONLY = [
  '.scratch/',
  '.work/sessions/.current-session',
  '.work/sessions/.pending-seeds.json*',
  '.work/sessions/*/.write-payload.md',
  '.work/sessions/*/.changelog-payload.md',
];
const CONFIG_REL = `.work/${CONFIG_FILENAME}`;
const SETUP_MESSAGE = 'chore(gps): set up gps';

// Adds the missing LOCAL_ONLY entries to .gitignore; returns those added.
function ensureLocalIgnores(projectRoot) {
  return LOCAL_ONLY.filter((entry) => ensureGitignoreEntry(projectRoot, entry));
}

// The CHANGELOG path init must create (changelog enabled, file missing), else null.
function missingChangelog(projectRoot) {
  const settings = changelogSettings(projectRoot);
  if (!settings.enabled || fs.existsSync(path.join(projectRoot, settings.path))) return null;
  return settings.path;
}

// Cheap check (no gh call) for hints: a git repo whose gps config is not
// committed yet.
function needsSetup(projectRoot) {
  return isWorkTree(projectRoot) && !isTracked(projectRoot, CONFIG_REL);
}

// Everything /gps init reports. Reads only (gh is asked about its login).
function inspectSetup(projectRoot) {
  const gitRepo = isWorkTree(projectRoot);
  const stored = readConfig(projectRoot);
  const state = {
    gitRepo,
    branch: gitRepo ? currentBranch(projectRoot) : null,
    github: diagnoseGithub(projectRoot),
    storedGithub: stored ? stored.github.enabled : null,
    configTracked: gitRepo && isTracked(projectRoot, CONFIG_REL),
    workIgnored: gitRepo && isIgnored(projectRoot, '.work/'),
    missingChangelog: missingChangelog(projectRoot),
    missingIgnores: LOCAL_ONLY.filter((entry) => !gitignoreCovers(projectRoot, entry)),
    gitignoreDirty: gitRepo && pathHasChanges(projectRoot, '.gitignore'),
  };
  state.ready = stored !== null && state.missingIgnores.length === 0 && state.missingChangelog === null && !state.workIgnored
    && (!gitRepo || (state.configTracked && !state.gitignoreDirty));
  return state;
}

// Writes the setup and commits it on the checked-out branch. Never commits
// changes to .gitignore the user made before (they are left for the user).
// Returns { configCreated, changelogCreated, unignored, added, commit } where commit is null
// outside a git repo, else { ok, sha, files, skipped } or a failed
// commitFiles result.
function applySetup(projectRoot, { unignoreWork = false } = {}) {
  const gitRepo = isWorkTree(projectRoot);
  const userEdits = gitRepo && pathHasChanges(projectRoot, '.gitignore');
  const unignored = unignoreWork && removeGitignoreEntry(projectRoot, '.work/');
  const configCreated = !fs.existsSync(path.join(projectRoot, CONFIG_REL));
  ensureProjectConfig(projectRoot);
  const added = ensureLocalIgnores(projectRoot);
  const changelogCreated = missingChangelog(projectRoot);
  if (changelogCreated) {
    fs.mkdirSync(path.dirname(path.join(projectRoot, changelogCreated)), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, changelogCreated), NEW_FILE_HEADER);
  }

  let commit = null;
  if (gitRepo) {
    const candidates = [...(userEdits ? [] : ['.gitignore']), CONFIG_REL, ...(changelogCreated ? [changelogCreated] : [])];
    const files = candidates
      .filter((file) => !isIgnored(projectRoot, file))
      .filter((file) => pathHasChanges(projectRoot, file));
    commit = files.length === 0
      ? { ok: true, sha: null, files: [], skipped: null }
      : commitFiles(projectRoot, files, SETUP_MESSAGE);
    if (userEdits) commit.skipped = '.gitignore has changes of your own: commit it yourself';
  }
  return { configCreated, changelogCreated, unignored, added, commit };
}

module.exports = { LOCAL_ONLY, SETUP_MESSAGE, ensureLocalIgnores, needsSetup, inspectSetup, applySetup };
