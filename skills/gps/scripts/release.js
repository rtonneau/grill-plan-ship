#!/usr/bin/env node

/**
 * release.js [--version X.Y.Z] [--json]
 *
 * /gps release, steps 1 and 2. Without --version (read-only): suggests the
 * next version from the gps bump markers under the CHANGELOG's Unreleased
 * block. With --version: turns Unreleased into "## X.Y.Z (date)", writes the
 * version into the version files, commits those files alone as
 * `chore(release): X.Y.Z` (body `Bump: <level>`) and tags vX.Y.Z.
 * Refuses, changing nothing, off the base branch, on a dirty tree, with the
 * changelog disabled or empty, or when the version is not a new one.
 */

const fs = require('fs');
const path = require('path');
const { main } = require('./lib/cli');
const { GpsError, UsageError, localDate } = require('./lib/guard');
const { changelogSettings, releaseSettings, saveVersionFiles } = require('./lib/project-config');
const { readBumpMarkers, unreleasedHasEntries, latestVersion, cutRelease } = require('./lib/changelog');
const { parseVersion, formatVersion, compareVersions, bumpVersion, maxLevel } = require('./lib/semver');
const { detectVersionFiles, readVersions, writeVersion } = require('./lib/version-files');
const { defaultBranch, currentBranch, isCleanTree, tagExists, createTag, commitFiles } = require('./lib/git');
const { sessionsDirOf, listSessionDirs, readConfigOrNull } = require('./lib/session-store');

// Finished sessions' configs, most recently finished first.
function finishedSessions(projectRoot) {
  const dir = sessionsDirOf(projectRoot);
  return listSessionDirs(dir)
    .map((id) => ({ id, config: readConfigOrNull(dir, id) }))
    .filter((s) => s.config && s.config.finished_at)
    .sort((a, b) => String(b.config.finished_at).localeCompare(String(a.config.finished_at)));
}

function baseBranchOf(projectRoot, finished) {
  const fallback = finished.find((s) => s.config.git && s.config.git.base_branch);
  return defaultBranch(projectRoot) || (fallback ? fallback.config.git.base_branch : null);
}

function release({ options, projectRoot, warn }) {
  const typed = options.version == null ? null : parseVersion(options.version);
  if (options.version != null && !typed) {
    throw new UsageError(`"${options.version}" is not a version. Use X.Y.Z.`);
  }

  const settings = changelogSettings(projectRoot);
  if (!settings.enabled) {
    throw new GpsError('Changelog is disabled (changelog.enabled = false); nothing was changed.',
      'Set changelog.enabled to true in .work/gps-config.json to release from it.');
  }
  const finished = finishedSessions(projectRoot);
  const base = baseBranchOf(projectRoot, finished);
  if (!base) {
    throw new GpsError('Cannot tell which branch releases are cut from; nothing was changed.',
      'Create a main or master branch, or set origin/HEAD.');
  }
  const branch = currentBranch(projectRoot);
  if (branch !== base) {
    throw new GpsError(`Releases are cut from ${base}, but ${branch || 'a detached HEAD'} is checked out; nothing was changed.`,
      `Run git switch ${base}, then run this again.`);
  }
  if (!isCleanTree(projectRoot)) {
    throw new GpsError('The working tree has uncommitted changes (the tree must be clean); nothing was changed.',
      'Commit or stash them, then run this again.');
  }
  const changelogPath = path.join(projectRoot, settings.path);
  const text = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, 'utf-8') : '';
  if (!unreleasedHasEntries(text)) {
    throw new GpsError(`${settings.path} has no entries under "## Unreleased"; nothing was changed.`,
      'Finish a session (it writes its entry), then run this again.');
  }

  const markers = readBumpMarkers(text);
  let level = maxLevel(markers.map((m) => m.level));
  if (!level) {
    level = 'patch';
    warn('No gps bump markers under Unreleased: suggesting patch.');
  }
  const sessionIds = [...new Set(markers.map((m) => m.sessionId))];
  const raised = finished
    .filter((s) => sessionIds.includes(s.id) && s.config.changelog && s.config.changelog.reason)
    .map((s) => ({ sessionId: s.id, reason: s.config.changelog.reason }));

  const storedFiles = releaseSettings(projectRoot).versionFiles;
  const versionFiles = storedFiles || detectVersionFiles(projectRoot);
  const found = readVersions(projectRoot, versionFiles).filter((v) => v.version !== null);
  const parsed = found.map((v) => parseVersion(v.version)).filter(Boolean);
  const heading = parseVersion(latestVersion(text) || '');
  const currentV = parsed.length ? parsed.reduce((a, b) => (compareVersions(a, b) >= 0 ? a : b)) : heading;
  const current = currentV ? formatVersion(currentV) : null;
  const mismatches = new Set(found.map((v) => v.version)).size > 1 ? found : [];
  if (!current && !typed) {
    throw new GpsError('No current version: no version file holds one and the CHANGELOG has no version heading; nothing was changed.',
      'Pass --version X.Y.Z (e.g. 0.1.0).');
  }

  let target = null;
  if (typed) {
    target = formatVersion(typed);
    if (currentV && compareVersions(typed, currentV) <= 0) {
      throw new GpsError(`Version ${target} must be greater than the current ${current}; nothing was changed.`,
        `Pass a version above ${current}.`);
    }
    if (tagExists(projectRoot, `v${target}`)) {
      throw new GpsError(`Tag v${target} already exists; nothing was changed.`, 'Pass a version that has not been released.');
    }
  }

  // First run: remember which files carry the version (a tracked config change, committed alone).
  if (!storedFiles) {
    saveVersionFiles(projectRoot, versionFiles);
    const saved = commitFiles(projectRoot, ['.work/gps-config.json'], 'chore(gps): record release version files');
    if (!saved.ok) warn(`Release version files saved but not committed (${saved.reason}). Run by hand: ${saved.commands.join(' && ')}`);
  }

  if (mismatches.length) {
    warn(`Version files disagree: ${mismatches.map((v) => `${v.file} ${v.version}`).join(', ')}.`);
  }

  if (!target) {
    const suggested = formatVersion(bumpVersion(currentV, level));
    const lines = [`${current} → ${suggested} (${level}: ${sessionIds.length} session(s))`,
      ...raised.map((r) => `  raised by Claude (${r.sessionId}): ${r.reason}`),
      `Next: ask the user to confirm, then release.js --version ${suggested}`];
    return {
      text: lines.join('\n'),
      data: { current, suggested, level, sessions: sessionIds.length, raised, versionFiles, mismatches },
    };
  }

  // Cut.
  const updated = cutRelease(text, target, localDate());
  const writable = found.map((v) => v.file);
  for (const file of versionFiles) {
    if (!writable.includes(file)) warn(`${file} has no readable version: left as is.`);
  }
  fs.writeFileSync(changelogPath, updated);
  for (const file of writable) writeVersion(projectRoot, file, target);
  const record = commitFiles(projectRoot, [settings.path, ...writable], `chore(release): ${target}\n\nBump: ${level}`);
  if (!record.ok) {
    throw new GpsError(`Release ${target} written but not committed (${record.reason}).`,
      `Run by hand: ${record.commands.join(' && ')} && git tag -a v${target} -m ${target}`);
  }
  const tag = createTag(projectRoot, `v${target}`, target);
  if (!tag.ok) warn(`Tag v${target} not created (${tag.reason}). Run by hand: ${tag.commands.join(' && ')}`);
  return {
    text: `🏷️ ${current ? `${current} → ` : ''}${target} (${level}) committed (${record.sha})${tag.ok ? `, tagged v${target}` : ''}\n`
      + 'Next: ask the user whether to push, then release.js --push',
    data: { current, version: target, level, tag: tag.ok ? `v${target}` : null, record, versionFiles: writable },
  };
}

main({
  usage: 'release.js [--version X.Y.Z] [--json]',
  options: { version: 'string' },
  run: release,
});
