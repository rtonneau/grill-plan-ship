#!/usr/bin/env node

/**
 * release.js [--version X.Y.Z | --push] [--json]
 *
 * --push (step 3) pushes the release commit and its tag, then creates the
 * GitHub Release when GitHub is on and release.githubRelease allows it for
 * the level in the commit's "Bump:" line. Re-runnable: it skips a push the
 * origin already has and a release that already exists.
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
const { changelogSettings, releaseSettings, saveVersionFiles, readConfig } = require('./lib/project-config');
const { readBumpMarkers, unknownBumpLevels, unreleasedHasEntries, latestVersion, cutRelease, sectionNotes } = require('./lib/changelog');
const { releaseExists, createRelease } = require('./lib/github');
const { parseVersion, formatVersion, compareVersions, bumpVersion, maxLevel } = require('./lib/semver');
const { detectVersionFiles, readVersions, writeVersion } = require('./lib/version-files');
const { defaultBranch, currentBranch, isCleanTree, tagExists, createTag, commitFiles, headCommit, pushWithTags, remoteHasTag, remoteBranchAt, headSha } = require('./lib/git');
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

function tagFailure(tagName, tag) {
  return new GpsError(`Release committed but tag ${tagName} not created (${tag.reason}).`,
    `Run by hand: ${tag.commands.join(' && ')}, or run this again to resume.`);
}

const RELEASE_COMMIT_RE = /^chore\(release\): (\d+\.\d+\.\d+)$/;

function pushNext(projectRoot) {
  const branch = currentBranch(projectRoot);
  return `Next: ask the user whether to push (by hand: git push --atomic --follow-tags origin ${branch || '<branch>'}), then release.js --push`;
}

// Steps 3: push the release commit and tag, then a GitHub Release by policy.
function push({ projectRoot, warn }) {
  const head = headCommit(projectRoot);
  const m = head && RELEASE_COMMIT_RE.exec(head.subject);
  if (!m || !head.tags.includes(`v${m[1]}`)) {
    throw new GpsError('HEAD is not a release commit with its tag (chore(release): X.Y.Z, tagged vX.Y.Z); nothing was pushed.',
      'Run release.js --version X.Y.Z first.');
  }
  const version = m[1];
  const tag = `v${version}`;
  const level = (/^Bump: (\w+)/m.exec(head.body) || [])[1] || null;
  const base = baseBranchOf(projectRoot, finishedSessions(projectRoot));
  if (!base) {
    throw new GpsError('Cannot tell which branch releases are cut from; nothing was pushed.',
      'Create a main or master branch, or set origin/HEAD.');
  }
  const branch = currentBranch(projectRoot);
  if (branch !== base) {
    throw new GpsError(`Releases are cut from ${base}, but ${branch || 'a detached HEAD'} is checked out; nothing was pushed.`,
      `Run git switch ${base}, then run this again.`);
  }
  // Validate the config before anything is pushed.
  const config = readConfig(projectRoot);
  const policy = releaseSettings(projectRoot).githubRelease;
  const changelogPath = path.join(projectRoot, changelogSettings(projectRoot).path);

  // Done only when origin has the tag and its branch is at HEAD (a push can land the tag alone).
  let pushed = false;
  if (!remoteHasTag(projectRoot, tag) || remoteBranchAt(projectRoot, branch) !== headSha(projectRoot)) {
    const res = pushWithTags(projectRoot, branch);
    if (!res.ok) {
      throw new GpsError(`Push failed (${res.reason}); nothing else was done.`,
        `Run by hand: ${res.commands.join(' && ')}, then run this again.`);
    }
    pushed = true;
  }

  // A missing config means GitHub off (never create files here).
  let result;
  if (!config || !config.github.enabled) {
    result = { skipped: 'github-off' };
  } else if (policy === 'none' || (policy === 'minor+' && level !== 'minor' && level !== 'major')) {
    result = { skipped: 'policy' };
  } else if (releaseExists(projectRoot, tag)) {
    result = { ok: true, url: null };
  } else {
    const notes = (fs.existsSync(changelogPath) && sectionNotes(fs.readFileSync(changelogPath, 'utf-8'), version)) || `Release ${version}`;
    result = createRelease(projectRoot, { tag, title: version, notes });
    if (!result.ok) {
      warn(`GitHub Release not created (${result.reason}). Run by hand: ${result.commands.join(' && ')}`);
    }
  }

  const lines = [`🚀 ${version}: ${pushed ? `pushed ${branch} and ${tag}` : `${tag} was already on origin, nothing pushed`}`];
  if (result.skipped === 'github-off') lines.push('GitHub Release skipped: GitHub is off for this project.');
  else if (result.skipped === 'policy') lines.push(`GitHub Release skipped: release.githubRelease is "${policy}" (${level || 'unknown'} release).`);
  else if (result.ok) lines.push(result.url ? `GitHub Release: ${result.url}` : 'GitHub Release already exists.');
  return { text: lines.join('\n'), data: { version, pushed, release: result } };
}

function release({ options, projectRoot, warn }) {
  if (options.push) {
    if (options.version != null) throw new UsageError('--push and --version cannot be combined.');
    return push({ projectRoot, warn });
  }
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
  // A release commit whose tag failed: only the tag is missing.
  if (typed) {
    const version = formatVersion(typed);
    const tagName = `v${version}`;
    const head = headCommit(projectRoot);
    if (head && head.subject === `chore(release): ${version}` && !tagExists(projectRoot, tagName)) {
      const resumed = createTag(projectRoot, tagName, version);
      if (!resumed.ok) throw tagFailure(tagName, resumed);
      const lvl = (/^Bump: (\w+)/m.exec(head.body) || [])[1] || null;
      return {
        text: `🏷️ ${version} was committed without its tag: tagged ${tagName}\n${pushNext(projectRoot)}`,
        data: { current: null, version, level: lvl, tag: tagName, record: null, versionFiles: [] },
      };
    }
  }
  const changelogPath = path.join(projectRoot, settings.path);
  const text = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, 'utf-8') : '';
  if (!unreleasedHasEntries(text)) {
    throw new GpsError(`${settings.path} has no entries under "## Unreleased"; nothing was changed.`,
      'Finish a session (it writes its entry), then run this again.');
  }

  const markers = readBumpMarkers(text);
  const unknown = unknownBumpLevels(text);
  if (unknown.length) {
    warn(`Ignored bump marker(s) with an unknown level (${unknown.join(', ')}): use patch, minor or major.`);
  }
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
  // First release: remember which files carry the version, in the same commit.
  const saveConfig = !storedFiles;
  if (saveConfig) saveVersionFiles(projectRoot, versionFiles);
  const record = commitFiles(projectRoot, [settings.path, ...writable, ...(saveConfig ? ['.work/gps-config.json'] : [])], `chore(release): ${target}\n\nBump: ${level}`);
  if (!record.ok) {
    throw new GpsError(`Release ${target} written but not committed (${record.reason}).`,
      `Run by hand: ${record.commands.join(' && ')} && git tag -a v${target} -m ${target}`);
  }
  const tag = createTag(projectRoot, `v${target}`, target);
  if (!tag.ok) throw tagFailure(`v${target}`, tag);
  return {
    text: `🏷️ ${current ? `${current} → ` : ''}${target} (${level}) committed (${record.sha}), tagged v${target}\n${pushNext(projectRoot)}`,
    data: { current, version: target, level, tag: `v${target}`, record, versionFiles: writable },
  };
}

main({
  usage: 'release.js [--version X.Y.Z | --push] [--json]',
  options: { version: 'string', push: 'boolean' },
  run: release,
});
