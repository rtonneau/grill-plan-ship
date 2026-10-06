#!/usr/bin/env node

/**
 * config.js [--json]                  show .work/gps-config.json and what detection finds now
 * config.js --rescan [--json]         detect GitHub again; writes only when the value is unchanged
 * config.js --rescan --apply [--json] write the newly detected value
 *
 * Also shows (read-only) changelog.enabled, release.versionFiles and
 * release.githubRelease.
 *
 * /gps config. Bare config.js is read-only (it only creates a missing
 * file). Claude runs --rescan --apply only after the user confirmed the
 * change.
 */

const path = require('path');
const { main } = require('./lib/cli');
const { CONFIG_FILENAME, rescanProjectConfig, changelogSettings, releaseSettings } = require('./lib/project-config');
const { UsageError } = require('./lib/guard');

const SCOPE_NOTE = 'The flag applies to sessions whose plan is not saved yet; sessions already planned keep their current mode.';
const onOff = (value) => (value ? 'on' : 'off');

main({
  usage: 'config.js [--rescan [--apply]] [--json]',
  options: { rescan: 'boolean', apply: 'boolean' },
  run({ options, projectRoot }) {
    if (options.apply && !options.rescan) throw new UsageError('--apply only goes with --rescan.');
    const file = path.join('.work', CONFIG_FILENAME);
    const result = rescanProjectConfig(projectRoot, { apply: options.apply, check: !options.rescan });
    const { status, stored, storedAt, detected } = result;
    const now = `GitHub detected now: ${onOff(detected.enabled)} (${detected.reason})`;
    const changelog = changelogSettings(projectRoot);
    const release = releaseSettings(projectRoot);
    const data = { status, stored, storedAt, detected, file, changelog, release };
    const settings = [
      `changelog.enabled = ${changelog.enabled} (path ${changelog.path})`,
      `release.versionFiles = ${release.versionFiles ? release.versionFiles.join(', ') : 'not saved yet'}`,
      `release.githubRelease = ${release.githubRelease}`,
    ];

    if (status === 'created') {
      return { text: `✅ Created ${file}: github.enabled = ${detected.enabled}\n${now}\n${settings.join('\n')}`, data };
    }
    const lines = [`${file}: github.enabled = ${stored} (detected_at ${storedAt || 'unknown'})`, now];
    if (status === 'unchanged') {
      lines.push(options.rescan ? '✅ Unchanged; detected_at refreshed.' : '✅ Stored value matches detection.');
    } else if (status === 'differs') {
      lines.push(`⚠️  Stored value differs: github.enabled ${stored} → ${detected.enabled}. Nothing was changed.`);
      if (stored && !detected.enabled) lines.push('⚠️  Applying turns GitHub off: a hand-forced true (e.g. GitHub Enterprise) would be lost.');
      lines.push(options.rescan
        ? 'Next: confirm with the user, then run config.js --rescan --apply.'
        : 'Next: /gps config --rescan to update it.', SCOPE_NOTE);
    } else {
      lines.push(`✅ Updated: github.enabled ${stored} → ${detected.enabled}.`, SCOPE_NOTE);
    }
    lines.push(...settings);
    return { text: lines.join('\n'), data };
  },
});
