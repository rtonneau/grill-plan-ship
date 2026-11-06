#!/usr/bin/env node

/**
 * release.js [--version X.Y.Z | --push | --publish [--version X.Y.Z]] [--approve-post-bump] [--json]
 *
 * --publish is the preapproved path: cut (the given or the suggested
 * version), then step 3, in one call and asking nothing. Re-runnable: HEAD
 * already a tagged release commit goes straight to the push.
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
 * version into the version files (and, for a Cargo workspace, the path
 * dependencies pinned to the previous version), runs release.postBump (below),
 * deletes the fragments, commits those files alone as `chore(release): X.Y.Z` (body `Bump: <level>`) and tags vX.Y.Z.
 * Refuses, changing nothing, off the base branch, on a dirty tree, with the
 * changelog disabled, nothing to release or an invalid fragment, or when the
 * version is not a new one. A cut
 * first fetches origin's base branch and refuses when HEAD is behind it (no
 * origin or a failed fetch only warns). The suggestion also lists the
 * patch, minor and major candidates (data.alternatives); the text lists each
 * distinct version once.
 *
 * release.postBump: shell commands run in order from the project root after the
 * version files are written and before the commit. They run only when the
 * list equals release.postBumpApproved; otherwise the cut refuses, naming
 * them, before writing anything. --approve-post-bump (with --version or
 * --publish) records the exact list there and the config joins the release
 * commit. The tracked files the commands changed join the commit; untracked
 * files they created only warn. A failing command puts the changelog, version
 * files, config and the files it touched back, and commits and tags nothing.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { main } = require('./lib/cli');
const { GpsError, UsageError, localDate } = require('./lib/guard');
const { changelogSettings, releaseSettings, saveVersionFiles, postBumpApproved, approvePostBump, readConfig } = require('./lib/project-config');
const { unreleasedHasEntries, latestVersion, renderRelease, sectionNotes } = require('./lib/changelog');
const { FRAGMENTS_DIR, listFragments, deleteFragments } = require('./lib/changelog-fragments');
const { releaseExists, createRelease } = require('./lib/github');
const { LEVELS, parseVersion, formatVersion, compareVersions, bumpVersion, maxLevel, levelBetween, levelRank } = require('./lib/semver');
const { detectVersionFiles, readVersions, writeVersion, rewriteCargoPins } = require('./lib/version-files');
const {
  defaultBranch, currentBranch, isCleanTree, isIgnored, isTracked, tagExists, createTag, commitFiles, restoreFromHead, headCommit,
  pushWithTags, remoteHasTag, remoteBranchAt, headSha, fetchBehind, changedTrackedFiles, untrackedFiles, discardTrackedChanges,
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

// Runs one release.postBump command through the platform shell from the
// project root, capturing its output so stdout stays the script's own.
// Never throws: { ok: true } or { ok: false, output }.
function runShell(projectRoot, command) {
  const win = process.platform === 'win32';
  try {
    execFileSync(win ? (process.env.ComSpec || 'cmd.exe') : '/bin/sh',
      win ? ['/d', '/s', '/c', `"${command}"`] : ['-c', command],
      { cwd: projectRoot, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], windowsVerbatimArguments: win, maxBuffer: Infinity });
    return { ok: true };
  } catch (err) {
    const output = [err.stdout, err.stderr].map((t) => String(t || '').trim()).filter(Boolean).join('\n') || err.message;
    return { ok: false, output: output.length > 4000 ? `...${output.slice(-4000)}` : output };
  }
}

const readOrNull = (file) => (fs.existsSync(file) ? fs.readFileSync(file) : null);

// Puts a cut back as it was: tracked files from HEAD, then the files that are
// not tracked (untracked or ignored) from their saved content (null: delete them).
// Never throws: { ok: true } or { ok: false, reason, commands }.
function undoCut(projectRoot, saved) {
  const discarded = discardTrackedChanges(projectRoot);
  try {
    for (const [file, content] of saved) {
      if (content === null) fs.rmSync(file, { force: true });
      else if (isTracked(projectRoot, path.relative(projectRoot, file).split(path.sep).join('/'))) continue;
      else if (!fs.existsSync(file) || !fs.readFileSync(file).equals(content)) fs.writeFileSync(file, content);
    }
  } catch (err) {
    return { ok: false, reason: err.message, commands: ['git status'] };
  }
  return discarded;
}

// Undoes a cut that cannot go on and throws: the message, what happened to the
// files, and the untracked files left behind (the rerun refuses until they go).
function abortCut(projectRoot, saved, message, hint) {
  const undone = undoCut(projectRoot, saved);
  const left = untrackedFiles(projectRoot);
  const note = undone.ok
    ? 'The changelog, version files and config were put back; nothing was committed or tagged.'
    : `Putting the files back failed (${undone.reason}): restore them by hand (${undone.commands.join(' && ')}). Nothing was committed or tagged.`;
  throw new GpsError(`${message}\n${note}${left.length ? ` Untracked files left behind: ${left.join(', ')}.` : ''}`,
    `${left.length ? 'Remove or commit those untracked files (a cut needs a clean tree). ' : ''}${hint}`);
}

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

// --publish: cut, then push, in one call.
function publish({ options, projectRoot, warn }) {
  const head = headCommit(projectRoot);
  const m = head && RELEASE_COMMIT_RE.exec(head.subject);
  const resume = m && head.tags.includes(`v${m[1]}`) && (options.version == null || options.version === m[1]);
  let cut = null;
  if (!resume) {
    const typed = options.version != null ? options.version : cutSuggested({ options, projectRoot, warn });
    cut = cutRelease({ options: { version: typed, 'approve-post-bump': options['approve-post-bump'] }, projectRoot, warn });
  }
  const pushed = push({ projectRoot, warn });
  return {
    text: [cut ? cut.text.split('\n')[0] : null, pushed.text].filter(Boolean).join('\n'),
    data: { ...pushed.data, cut: cut ? cut.data : null },
  };
}

function cutSuggested(args) {
  return cutRelease({ ...args, options: {} }).data.suggested;
}

function release({ options, projectRoot, warn }) {
  if (options.publish) {
    if (options.push) throw new UsageError('--publish and --push cannot be combined.');
    return publish({ options, projectRoot, warn });
  }
  if (options.push) {
    if (options.version != null) throw new UsageError('--push and --version cannot be combined.');
    if (options['approve-post-bump']) throw new UsageError('--approve-post-bump goes with a cut (--version or --publish), not --push.');
    return push({ projectRoot, warn });
  }
  if (options['approve-post-bump'] && options.version == null) {
    throw new UsageError('--approve-post-bump goes with --version or --publish: the cut records the approval.');
  }
  return cutRelease({ options, projectRoot, warn });
}

function cutRelease({ options, projectRoot, warn }) {
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

  // A manual list is used as is; otherwise (detected, or a legacy config
  // without a source) the list is detected again on every release.
  const releaseConfig = releaseSettings(projectRoot);
  const { versionFiles: storedFiles, versionFilesSource, postBump } = releaseConfig;
  const approved = postBumpApproved(releaseConfig);
  const manual = Boolean(storedFiles) && versionFilesSource === 'manual';
  // Re-detection only adds: saved entries stay first, in their saved order.
  const detectedFiles = manual ? [] : detectVersionFiles(projectRoot);
  const versionFiles = manual ? storedFiles : [...(storedFiles || []), ...detectedFiles.filter((f) => !(storedFiles || []).includes(f))];
  const added = storedFiles ? versionFiles.filter((f) => !storedFiles.includes(f)) : [];
  if (added.length && !typed) warn(`Detected version file(s) the saved list does not hold: ${added.join(', ')} (a cut adds them).`);
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
    const ask = postBump.length > 0 && !approved;
    const byVersion = new Map();
    for (const l of LEVELS) byVersion.set(alternatives[l], [...(byVersion.get(alternatives[l]) || []), l]);
    const lines = [`${current} → ${suggested} (${level}: ${fragments.length} session(s))`,
      ...raised.map((r) => `  raised by Claude (${r.sessionId}): ${r.reason || '(no reason given)'}`),
      `Candidates: ${[...byVersion].map(([v, levels]) => `${levels.join('/')} ${v}`).join(', ')}`,
      ...(postBump.length ? [`Post-bump commands (${approved ? 'approved' : 'NOT approved yet'}):`, ...postBump.map((c) => `  ${c}`)] : []),
      `Next: ask the user to confirm${ask ? ' and to approve the post-bump commands' : ''}, then release.js --version ${suggested}${ask ? ' --approve-post-bump' : ''}`];
    return {
      text: lines.join('\n'),
      data: { current, suggested, level, alternatives, sessions: fragments.length, raised, versionFiles, mismatches, postBump, postBumpApproved: approved },
    };
  }

  // Cut. The level recorded is the one of the version chosen (the fragments'
  // level when there is no current version), so a user who picks a minor
  // version over patch fragments gets the minor+ release policy.
  const chosen = currentV ? levelBetween(currentV, typed) : level;
  // The commands are shell strings from a committed file: they run only as approved.
  if (postBump.length && !approved && !options['approve-post-bump']) {
    const why = releaseConfig.postBumpApproved.length ? 'release.postBump changed since it was approved' : 'release.postBump is not approved';
    throw new GpsError(`${why}; nothing was changed. Commands:\n${postBump.map((c) => `  ${c}`).join('\n')}`,
      `Show the user these commands; once they approve, run release.js --version ${target} --approve-post-bump.`);
  }
  const updated = renderRelease(text, target, localDate(), fragments.map((f) => f.body));
  const writable = found.map((v) => v.file);
  for (const file of versionFiles) {
    if (!writable.includes(file)) warn(`${file} has no readable version: left as is.`);
  }
  const configFile = '.work/gps-config.json';
  const configPath = path.join(projectRoot, configFile);
  const saved = new Map([[changelogPath, readOrNull(changelogPath)], [configPath, readOrNull(configPath)]]);
  fs.mkdirSync(path.dirname(changelogPath), { recursive: true });
  fs.writeFileSync(changelogPath, updated);
  for (const file of writable) writeVersion(projectRoot, file, target);
  // A Cargo workspace also moves the path dependencies pinned to its old version.
  const cargoBefore = found.find((v) => v.file === 'Cargo.toml');
  const pinned = cargoBefore ? rewriteCargoPins(projectRoot, cargoBefore.version, target, { warn }) : [];
  const released = [...new Set([...writable, ...pinned])];
  // The released fragments go. Tracked ones (even force-added under an
  // ignored .work/) are deleted now and committed as deletions, and put back
  // from HEAD if the commit fails; the others are deleted only once the
  // release commit exists, so a failed commit keeps them.
  const files = fragments.map((f) => f.file);
  const tracked = files.filter((f) => isTracked(projectRoot, f));
  const untracked = files.filter((f) => !tracked.includes(f));
  // First release: remember which files carry the version, in the same commit.
  // A git-ignored (and untracked) config is saved but stays out of the commit.
  const saveFiles = !manual && (!storedFiles || versionFiles.join('\n') !== storedFiles.join('\n'));
  if (saveFiles) saveVersionFiles(projectRoot, versionFiles);
  // An approval joins the release commit too, so the next release starts clean.
  const saveApproval = postBump.length > 0 && !approved;
  if (saveApproval) approvePostBump(projectRoot, postBump);
  const saveConfig = saveFiles || saveApproval;
  const commitConfig = saveConfig && (isTracked(projectRoot, configFile) || !isIgnored(projectRoot, configFile));

  // Post-bump commands run before the fragments go, so a failure has only the
  // written files to put back (and untracked files the commands created to report).
  const planned = [settings.path, ...released, ...(commitConfig ? [configFile] : [])];
  for (const command of postBump) {
    const res = runShell(projectRoot, command);
    if (res.ok) continue;
    abortCut(projectRoot, saved, `Post-bump command failed: ${command}\n${res.output}`,
      'Fix the command (release.postBump in .work/gps-config.json, committed) or its cause, then run this again (add --approve-post-bump if the list is not approved).');
  }
  let postBumpFiles = [];
  if (postBump.length) {
    // Without this list the commands' changes would silently miss the release commit.
    const changed = changedTrackedFiles(projectRoot);
    if (!changed.ok) {
      abortCut(projectRoot, saved, `Cannot list the files the post-bump commands changed (${changed.reason}).`,
        'Fix what git reports (git status), then run this again.');
    }
    postBumpFiles = changed.files.filter((f) => !planned.includes(f));
    const created = untrackedFiles(projectRoot).filter((f) => !planned.includes(f));
    if (created.length) warn(`Post-bump commands created untracked file(s), left out of the release commit: ${created.join(', ')}.`);
  }
  deleteFragments(projectRoot, tracked);
  const record = commitFiles(projectRoot, [...new Set([...planned, ...postBumpFiles, ...tracked])],
    `chore(release): ${target}\n\nBump: ${chosen}`);
  if (!record.ok) {
    const restored = restoreFromHead(projectRoot, tracked);
    const lost = restored.ok ? '' : ` Restoring the fragments failed (${restored.reason}): run ${restored.commands.join(' && ')} first.`;
    const del = untracked.length ? `; then delete ${untracked.join(', ')} (git does not track them)` : '';
    throw new GpsError(`Release ${target} written but not committed (${record.reason}); the changelog fragments are kept.${lost}`,
      `Run by hand: ${record.commands.join(' && ')} && git tag -a v${target} -m ${target}${del}`);
  }
  deleteFragments(projectRoot, untracked);
  if (added.length) warn(`Detected version file(s) the saved list did not hold: ${added.join(', ')} (saved list updated).`);
  const tag = createTag(projectRoot, `v${target}`, target);
  if (!tag.ok) throw tagFailure(`v${target}`, tag);
  return {
    text: [`🏷️ ${current ? `${current} → ` : ''}${target} (${chosen}) committed (${record.sha}), tagged v${target}`,
      ...(postBump.length ? [`Post-bump: ran ${postBump.length} command(s), ${postBumpFiles.length} changed file(s) joined the commit.`] : []),
      pushNext(projectRoot)].join('\n'),
    data: { current, version: target, level: chosen, tag: `v${target}`, record, versionFiles: writable, pinFiles: pinned, postBumpFiles },
  };
}

main({
  usage: 'release.js [--version X.Y.Z | --push | --publish [--version X.Y.Z]] [--approve-post-bump] [--json]',
  options: { version: 'string', push: 'boolean', publish: 'boolean', 'approve-post-bump': 'boolean' },
  run: release,
});
