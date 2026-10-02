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

function validate(config, filePath) {
  if (!config || !config.github || typeof config.github.enabled !== 'boolean') {
    throw new GpsError(
      `${CONFIG_FILENAME} is invalid: "github.enabled" must be true or false (${filePath}).`,
      'Fix the file by hand, or delete it so the next command detects GitHub again.'
    );
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

module.exports = { CONFIG_FILENAME, ensureProjectConfig, githubEnabled, rescanProjectConfig };
