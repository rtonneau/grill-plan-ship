#!/usr/bin/env node

/**
 * init.js [--json]                             check the project's gps setup (changes nothing)
 * init.js --apply [--unignore-work] [--json]   set it up and commit it
 *
 * /gps init (optional; /gps start works without it). The check reports the
 * git repository and branch, GitHub detection, the per-machine files git
 * must ignore, and whether .work/ is git-ignored or its config committed.
 * --apply creates .work/gps-config.json when missing, the CHANGELOG (its
 * configured path, default CHANGELOG.md) when missing and the changelog is
 * enabled, adds the missing .gitignore entries and commits them as `chore(gps): set up gps` on the
 * checked-out branch (changes the user already had in .gitignore are left
 * out). --unignore-work also removes a ".work/" line an older gps added;
 * Claude passes it only after the user agreed. A stored GitHub flag is
 * never changed here: /gps config --rescan does that.
 */

const { main } = require('./lib/cli');
const { inspectSetup, applySetup } = require('./lib/setup');
const { UsageError } = require('./lib/guard');

const onOff = (value) => (value ? 'on' : 'off');

function checkLines(state) {
  const lines = [];
  lines.push(state.gitRepo
    ? `- **Git:** repository, on ${state.branch ? `branch ${state.branch}` : 'a detached HEAD'}`
    : '- **Git:** ⚠️ not a git repository: gps works, but commits nothing (run git init to change that)');
  const stored = state.storedGithub === null ? 'not stored yet' : `stored ${onOff(state.storedGithub)}`;
  lines.push(`- **GitHub:** detected ${onOff(state.github.enabled)} (${state.github.reason}); ${stored}`);
  lines.push(state.missingIgnores.length === 0
    ? '- **.gitignore:** per-machine files ignored'
    : `- **.gitignore:** missing ${state.missingIgnores.join(', ')}`);
  if (state.missingChangelog) lines.push(`- **Changelog:** ${state.missingChangelog} missing (created with a title only)`);
  if (state.gitRepo) {
    lines.push(state.workIgnored
      ? '- **.work/:** ⚠️ git-ignored (an older gps added it): gps commits none of its session files'
      : '- **.work/:** committed with the code');
    lines.push(`- **Setup commit:** ${state.configTracked ? 'done' : 'not made yet'}`);
    if (state.gitignoreDirty) lines.push('- **.gitignore:** has uncommitted changes of your own (they stay out of the setup commit)');
  }
  return lines;
}

function check(projectRoot, warn) {
  const state = inspectSetup(projectRoot);
  const lines = ['## gps setup', '', ...checkLines(state), ''];
  if (state.storedGithub !== null && state.storedGithub !== state.github.enabled) {
    warn('The stored GitHub flag differs from detection: /gps config --rescan updates it.');
  }
  if (state.ready) {
    lines.push('✅ gps is set up.', 'Next: /gps start <feature-name>');
  } else {
    const flags = state.workIgnored ? ' (with --unignore-work if the user wants .work/ committed)' : '';
    lines.push(`Next: confirm with the user, then run init.js --apply${flags}.`);
  }
  return { text: lines.join('\n'), data: state };
}

function apply(projectRoot, options, warn) {
  const result = applySetup(projectRoot, { unignoreWork: options['unignore-work'] });
  const state = inspectSetup(projectRoot);
  const lines = ['## gps setup', ''];
  if (result.configCreated) lines.push(`✅ Created .work/gps-config.json: GitHub ${onOff(state.github.enabled)} (${state.github.reason})`);
  if (result.changelogCreated) lines.push(`✅ Created ${result.changelogCreated}: /gps release fills it from the sessions' fragments`);
  if (result.unignored) lines.push('✅ Removed ".work/" from .gitignore: session files are committed from now on');
  if (result.added.length > 0) lines.push(`✅ Added to .gitignore: ${result.added.join(', ')}`);
  const { commit } = result;
  if (commit && commit.ok && commit.sha) {
    lines.push(`📦 Committed the setup (${commit.sha}) on ${state.branch || 'a detached HEAD'}: ${commit.files.join(', ')}`);
  } else if (commit && !commit.ok) {
    warn(`Setup not committed (${commit.reason}). Run by hand: ${commit.commands.join(' && ')}`);
  } else if (commit && !commit.skipped && !result.configCreated && !result.changelogCreated && result.added.length === 0 && !result.unignored) {
    lines.push('✅ Nothing to change: gps was already set up.');
  }
  if (commit && commit.skipped) warn(`${commit.skipped}.`);
  if (state.workIgnored) warn('.work/ is still git-ignored: gps commits none of its session files.');
  lines.push('', ...checkLines(state), '', 'Next: /gps start <feature-name>');
  return { text: lines.join('\n'), data: { ...result, state } };
}

main({
  usage: 'init.js [--apply [--unignore-work]] [--json]',
  options: { apply: 'boolean', 'unignore-work': 'boolean' },
  run({ options, projectRoot, warn }) {
    if (options['unignore-work'] && !options.apply) throw new UsageError('--unignore-work only goes with --apply.');
    return options.apply ? apply(projectRoot, options, warn) : check(projectRoot, warn);
  },
});
