// skills/gps/scripts/lib/project-config.js
//
// Project-wide gps settings in <projectRoot>/.work/gps-config.json. Today
// that is one flag, github.enabled: true when origin is on github.com AND
// `gh auth status` succeeds. It is detected when the file is first created,
// and again only when the user runs /gps config --rescan; every other
// command just reads it, so editing the file by hand forces GitHub features
// on or off (GitHub Enterprise, opting out).

const fs = require('fs');
const path = require('path');
const { GpsError, readJson, writeJsonAtomic } = require('./guard');
const { diagnoseGithub } = require('./github');

const CONFIG_FILENAME = 'gps-config.json';
const CONFIG_VERSION = 1;

function configPath(projectRoot) {
  return path.join(projectRoot, '.work', CONFIG_FILENAME);
}

const GITHUB_RELEASE_MODES = ['none', 'minor+', 'all'];

function invalid(what, filePath) {
  return new GpsError(
    `${CONFIG_FILENAME} is invalid: ${what} (${filePath}).`,
    'Fix the file by hand, or delete it so the next command detects the settings again.'
  );
}

function validate(config, filePath) {
  if (!config || !config.github || typeof config.github.enabled !== 'boolean') {
    throw invalid('"github.enabled" must be true or false', filePath);
  }
  const { changelog, release } = config;
  if (changelog !== undefined) {
    if (changelog.enabled !== undefined && typeof changelog.enabled !== 'boolean') {
      throw invalid('"changelog.enabled" must be true or false', filePath);
    }
    if (changelog.path !== undefined && (typeof changelog.path !== 'string' || !changelog.path)) {
      throw invalid('"changelog.path" must be a file path string', filePath);
    }
  }
  if (release !== undefined) {
    if (release.githubRelease !== undefined && !GITHUB_RELEASE_MODES.includes(release.githubRelease)) {
      throw invalid(`"release.githubRelease" must be one of ${GITHUB_RELEASE_MODES.join(', ')}`, filePath);
    }
    const files = release.versionFiles;
    if (files !== undefined && files !== null && !(Array.isArray(files) && files.every((f) => typeof f === 'string'))) {
      throw invalid('"release.versionFiles" must be a list of file paths', filePath);
    }
  }
  return config;
}

function readConfig(projectRoot) {
  const filePath = configPath(projectRoot);
  return fs.existsSync(filePath) ? validate(readJson(filePath, CONFIG_FILENAME), filePath) : null;
}

function writeConfig(projectRoot, config) {
  const filePath = configPath(projectRoot);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  writeJsonAtomic(filePath, config);
}

function createConfig(projectRoot, detected) {
  const config = {
    version: CONFIG_VERSION,
    github: { enabled: detected.enabled, detected_at: new Date().toISOString() },
  };
  writeConfig(projectRoot, config);
  return config;
}

// The parsed config; creates the file (detecting GitHub) when it is missing.
function ensureProjectConfig(projectRoot) {
  return readConfig(projectRoot) || createConfig(projectRoot, diagnoseGithub(projectRoot));
}

function githubEnabled(projectRoot) {
  return ensureProjectConfig(projectRoot).github.enabled;
}

// Detects GitHub again and compares with the stored flag. Returns
// { status, stored, storedAt, detected: { enabled, reason }, config }, where
// stored/storedAt are the values before the call and status is:
//   created   — the file was missing and now holds the detected value
//   unchanged — same value; detected_at is refreshed unless `check` is set
//   differs   — different value, nothing written (the user must confirm)
//   updated   — different value, written because `apply` was set
// `check` (bare /gps config) never writes, except to create a missing file.
function rescanProjectConfig(projectRoot, { apply = false, check = false } = {}) {
  const existing = readConfig(projectRoot);
  const detected = diagnoseGithub(projectRoot);
  if (!existing) {
    return { status: 'created', stored: null, storedAt: null, detected, config: createConfig(projectRoot, detected) };
  }

  const stored = existing.github.enabled;
  const storedAt = existing.github.detected_at || null;
  const same = stored === detected.enabled;
  if (check || (!same && !apply)) {
    return { status: same ? 'unchanged' : 'differs', stored, storedAt, detected, config: existing };
  }

  const config = {
    ...existing,
    github: { ...existing.github, enabled: detected.enabled, detected_at: new Date().toISOString() },
  };
  writeConfig(projectRoot, config);
  return { status: same ? 'unchanged' : 'updated', stored, storedAt, detected, config };
}

// Changelog and release settings, defaults applied on read (a read never
// writes the file). versionFiles is null until saved: callers detect them.
function changelogSettings(projectRoot) {
  const changelog = (readConfig(projectRoot) || {}).changelog || {};
  return {
    enabled: changelog.enabled === undefined ? true : changelog.enabled,
    path: changelog.path || 'CHANGELOG.md',
  };
}

function releaseSettings(projectRoot) {
  const release = (readConfig(projectRoot) || {}).release || {};
  return {
    versionFiles: release.versionFiles || null,
    githubRelease: release.githubRelease || 'minor+',
  };
}

function saveVersionFiles(projectRoot, files) {
  const config = ensureProjectConfig(projectRoot);
  writeConfig(projectRoot, { ...config, release: { ...config.release, versionFiles: files } });
}

module.exports = {
  CONFIG_FILENAME, readConfig, ensureProjectConfig, githubEnabled, rescanProjectConfig,
  changelogSettings, releaseSettings, saveVersionFiles,
};
