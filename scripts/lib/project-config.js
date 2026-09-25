// scripts/lib/project-config.js
//
// Project-wide gps settings in <projectRoot>/.work/gps-config.json. Today
// that is one flag, github.enabled: true when origin is on github.com AND
// `gh auth status` succeeds. It is detected once, when the file is first
// created, and only read afterwards, so editing the file by hand forces
// GitHub features on or off (GitHub Enterprise, opting out, gh login later).

const fs = require('fs');
const path = require('path');
const { GpsError, readJson, writeJsonAtomic } = require('./guard');
const { detectGithub, ghAuthenticated } = require('./github');

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

// The parsed config; creates the file (detecting GitHub) when it is missing.
function ensureProjectConfig(projectRoot) {
  const filePath = configPath(projectRoot);
  if (fs.existsSync(filePath)) return validate(readJson(filePath, CONFIG_FILENAME), filePath);

  const config = {
    version: CONFIG_VERSION,
    github: {
      enabled: detectGithub(projectRoot) && ghAuthenticated(projectRoot),
      detected_at: new Date().toISOString(),
    },
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  writeJsonAtomic(filePath, config);
  return config;
}

function githubEnabled(projectRoot) {
  return ensureProjectConfig(projectRoot).github.enabled;
}

module.exports = { CONFIG_FILENAME, ensureProjectConfig, githubEnabled };
