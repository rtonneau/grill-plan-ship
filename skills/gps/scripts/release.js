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
 * next version from the sessions' changelog fragments (.work/changelog/, the
 * highest bump wins; hand-written Unreleased bullets alone suggest patch).
 * With --version: writes the release section "## X.Y.Z (date)" (hand-written
 * Unreleased bullets first, then the fragments in file order), writes the
 * version into the version files, deletes the fragments, commits those files
 * alone as `chore(release): X.Y.Z` (body `Bump: <level>`) and tags vX.Y.Z.
 * Refuses, changing nothing, off the base branch, on a dirty tree, with the
 * changelog disabled, nothing to release or an invalid fragment, or when the
 * version is not a new one. A cut
 * first fetches origin's base branch and refuses when HEAD is behind it (no
 * origin or a failed fetch only warns). The suggestion also lists the
 * patch, minor and major candidates (data.alternatives); the text lists each
 * distinct version once.
 */

const fs = require('fs');
const path = require('path');
const { main } = require('./lib/cli');
const { GpsError, UsageError, localDate } = require('./lib/guard');
const { changelogSettings, releaseSettings, saveVersionFiles, readConfig } = require('./lib/project-config');
const { unreleasedHasEntries, latestVersion, renderRelease, sectionNotes } = require('./lib/changelog');
const { FRAGMENTS_DIR, listFragments, deleteFragments } = require('./lib/changelog-fragments');
const { releaseExists, createRelease } = require('./lib/github');
const { LEVELS, parseVersion, formatVersion, compareVersions, bumpVersion, maxLevel, levelBetween, levelRank } = require('./lib/semver');
const { detectVersionFiles, readVersions, writeVersion } = require('./lib/version-files');
const {
  defaultBranch, currentBranch, isCleanTree, isIgnored, isTracked, tagExists, createTag, commitFiles, headCommit,
  pushWithTags, remoteHasTag, remoteBranchAt, headSha, fetchBehind,
} = require('./lib/git');
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
const BUMP_LINE_RE = /^Bump: (\w+)/m;

// The level in a release commit's "Bump:" line, or null.
const bumpOf = (body) => (BUMP_LINE_RE.exec(body || '') || [])[1] || null;

function pushNext(projectRoot) {
  const branch = currentBranch(projectRoot);
  return `Next: ask the user whether to push (by hand: git push --atomic --follow-tags origin ${branch || '<branch>'}), then release.js --push`;
}

// Step 3: push the release commit and tag, then a GitHub Release by policy.
function push({ projectRoot, warn }) {
  const head = headCommit(projectRoot);
  const m = head && RELEASE_COMMIT_RE.exec(head.subject);
  if (!m || !head.tags.includes(`v${m[1]}`)) {
    throw new GpsError('HEAD is not a release commit with its tag (chore(release): X.Y.Z, tagged vX.Y.Z); nothing was pushed.',
      'Run release.js --version X.Y.Z first.');
  }
  const version = m[1];
  const tag = `v${version}`;
  const level = bumpOf(head.body);
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
      const lvl = bumpOf(head.body);
      return {
        text: `🏷️ ${version} was committed without its tag: tagged ${tagName}\n${pushNext(projectRoot)}`,
        data: { current: null, version, level: lvl, tag: tagName, record: null, versionFiles: [] },
      };
    }
    // Cut from origin's latest base (merged PRs land there); suggest mode
    // stays read-only and never fetches.
    const sync = fetchBehind(projectRoot, base);
    if (!sync.ok) {
      warn(`${base} not checked against origin (${sync.reason}): cutting from the local ${base}.`);
    } else if (sync.behind > 0) {
      throw new GpsError(`${base} is ${sync.behind} commit(s) behind origin/${base}; nothing was changed.`,
        'Run git pull, then run this again.');
    }
  }
  const changelogPath = path.join(projectRoot, settings.path);
  const text = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, 'utf-8') : null;
  // An invalid fragment refuses here, naming the file, before anything is written.
  const fragments = listFragments(projectRoot);
  if (fragments.length === 0 && !unreleasedHasEntries(text)) {
    throw new GpsError(`Nothing to release: no changelog fragment and no entry under "## Unreleased" in ${settings.path}; nothing was changed.`,
      `Run git pull if sessions were merged elsewhere, or finish a session (it writes ${FRAGMENTS_DIR}/<session-id>.md), then run this again.`);
  }

  let level = maxLevel(fragments.map((f) => f.bump));
  if (!level) {
    level = 'patch';
    warn(`No changelog fragment in ${FRAGMENTS_DIR}/, only hand-written entries under "## Unreleased": suggesting patch.`);
  }
  const raised = fragments
    .filter((f) => levelRank(f.bump) > levelRank(f.floor))
    .map((f) => ({ sessionId: f.sessionId, reason: f.reason }));

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
    const alternatives = Object.fromEntries(LEVELS.map((l) => [l, formatVersion(bumpVersion(currentV, l))]));
    // Each distinct version once, with every level that gives it (0.x: minor/major).
    const byVersion = new Map();
    for (const l of LEVELS) byVersion.set(alternatives[l], [...(byVersion.get(alternatives[l]) || []), l]);
    const lines = [`${current} → ${suggested} (${level}: ${fragments.length} session(s))`,
      ...raised.map((r) => `  raised by Claude (${r.sessionId}): ${r.reason || '(no reason given)'}`),
      `Candidates: ${[...byVersion].map(([v, levels]) => `${levels.join('/')} ${v}`).join(', ')}`,
      `Next: ask the user to confirm, then release.js --version ${suggested}`];
    return {
      text: lines.join('\n'),
      data: { current, suggested, level, alternatives, sessions: fragments.length, raised, versionFiles, mismatches },
    };
  }

  // Cut. The level recorded is the one of the version chosen (the fragments'
  // level when there is no current version), so a user who picks a minor
  // version over patch fragments gets the minor+ release policy.
  const chosen = currentV ? levelBetween(currentV, typed) : level;
  const updated = renderRelease(text, target, localDate(), fragments.map((f) => f.body));
  const writable = found.map((v) => v.file);
  for (const file of versionFiles) {
    if (!writable.includes(file)) warn(`${file} has no readable version: left as is.`);
  }
  fs.mkdirSync(path.dirname(changelogPath), { recursive: true });
  fs.writeFileSync(changelogPath, updated);
  for (const file of writable) writeVersion(projectRoot, file, target);
  // The released fragments go; their deletion is staged only when git tracks
  // them (git add of a deleted tracked path stages the removal) and .work/ is
  // not ignored (git add refuses an ignored path).
  const files = fragments.map((f) => f.file);
  const deleted = isIgnored(projectRoot, '.work/') ? [] : files.filter((f) => isTracked(projectRoot, f));
  deleteFragments(projectRoot, files);
  // First release: remember which files carry the version, in the same commit.
  // A git-ignored (and untracked) config is saved but stays out of the commit.
  const configFile = '.work/gps-config.json';
  const saveConfig = !storedFiles;
  if (saveConfig) saveVersionFiles(projectRoot, versionFiles);
  const commitConfig = saveConfig && (isTracked(projectRoot, configFile) || !isIgnored(projectRoot, configFile));
  const record = commitFiles(projectRoot, [settings.path, ...writable, ...deleted, ...(commitConfig ? [configFile] : [])], `chore(release): ${target}\n\nBump: ${chosen}`);
  if (!record.ok) {
    throw new GpsError(`Release ${target} written but not committed (${record.reason}).`,
      `Run by hand: ${record.commands.join(' && ')} && git tag -a v${target} -m ${target}`);
  }
  const tag = createTag(projectRoot, `v${target}`, target);
  if (!tag.ok) throw tagFailure(`v${target}`, tag);
  return {
    text: `🏷️ ${current ? `${current} → ` : ''}${target} (${chosen}) committed (${record.sha}), tagged v${target}\n${pushNext(projectRoot)}`,
    data: { current, version: target, level: chosen, tag: `v${target}`, record, versionFiles: writable },
  };
}

main({
  usage: 'release.js [--version X.Y.Z | --push] [--json]',
  options: { version: 'string', push: 'boolean' },
  run: release,
});
