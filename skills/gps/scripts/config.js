#!/usr/bin/env node

/**
 * config.js [--json]                  show .work/gps-config.json and what detection finds now
 * config.js --rescan [--json]         detect GitHub again; writes only when the value is unchanged
 * config.js --rescan --apply [--json] write the newly detected value
 * config.js --enable-jev [--json]    authorize ticket transmission to TypeSafe
 *
 * Also shows (read-only) changelog.enabled, release.versionFiles,
 * release.githubRelease, scratch.cleanupOnFinish, scratch.extraDirs and ship.autoFinish.
 *
 * /gps config. Bare config.js is read-only (it only creates a missing
 * file). Claude runs --rescan --apply only after the user confirmed the
 * change.
 */

const path = require('path');
const { main } = require('./lib/cli');
const { pinnedCodexModel } = require('./lib/host-dispatch');
const { TICKET_MODELS } = require('./lib/ticket-model');
const { CONFIG_FILENAME, readConfig, rescanProjectConfig, rescanJevConfig, enableJev, changelogSettings, releaseSettings, scratchSettings, shipSettings } = require('./lib/project-config');
const { UsageError } = require('./lib/guard');

const SCOPE_NOTE = 'The flag applies to sessions whose plan is not saved yet; sessions already planned keep their current mode.';
const onOff = (value) => (value ? 'on' : 'off');

// The report lines for one flag (github or jev): created/unchanged/differs/updated,
// each phrased the same way regardless of which flag it describes.
function describeFlag(name, label, file, result, { rescan, extraDiffers } = {}) {
  const { status, stored, storedAt, detected } = result;
  const now = `${label} detected now: ${onOff(detected.enabled)} (${detected.reason})`;
  if (status === 'created') {
    return [`✅ Created ${file}: ${name}.enabled = ${detected.enabled}`, now];
  }
  const lines = [`${file}: ${name}.enabled = ${stored} (detected_at ${storedAt || 'unknown'})`, now];
  if (status === 'unchanged') {
    lines.push(rescan ? '✅ Unchanged; detected_at refreshed.' : '✅ Stored value matches detection.');
  } else if (status === 'differs') {
    lines.push(`⚠️  Stored value differs: ${name}.enabled ${stored} → ${detected.enabled}. Nothing was changed.`);
    if (extraDiffers) lines.push(extraDiffers);
    lines.push(rescan
      ? 'Next: confirm with the user, then run config.js --rescan --apply.'
      : 'Next: /gps config --rescan to update it.', SCOPE_NOTE);
  } else {
    lines.push(`✅ Updated: ${name}.enabled ${stored} → ${detected.enabled}.`, SCOPE_NOTE);
  }
  return lines;
}

main({
  usage: 'config.js [--rescan [--apply]] [--enable-jev] [--json]',
  options: { rescan: 'boolean', apply: 'boolean', 'enable-jev': 'boolean' },
  run({ options, projectRoot }) {
    if (options.apply && !options.rescan) throw new UsageError('--apply only goes with --rescan.');
    if (options['enable-jev']) enableJev(projectRoot);
    const file = path.join('.work', CONFIG_FILENAME);
    const rescanOpts = { apply: options.apply, check: !options.rescan };
    const github = rescanProjectConfig(projectRoot, rescanOpts);
    const jev = rescanJevConfig(projectRoot, rescanOpts);
    const changelog = changelogSettings(projectRoot);
    const release = releaseSettings(projectRoot);
    const scratch = scratchSettings(projectRoot);
    const ship = shipSettings(projectRoot);
    const config = readConfig(projectRoot) || {};
    const delegation = config.delegation || null;
    const data = { github, jev, file, changelog, release, scratch, ship, delegation };
    const settings = [
      `jev.consent = ${Boolean(config.jev && config.jev.consent)} (authorizes complete ticket names and bodies to https://api.typesafe.ai/v1/systemone; enable with config.js --enable-jev)`,
      `changelog.enabled = ${changelog.enabled} (path ${changelog.path})`,
      `release.versionFiles = ${release.versionFiles ? release.versionFiles.join(', ') : 'not saved yet'}`,
      `release.githubRelease = ${release.githubRelease}`,
      `scratch.cleanupOnFinish = ${scratch.cleanupOnFinish}`,
      `scratch.extraDirs = ${scratch.extraDirs.length ? scratch.extraDirs.join(', ') : 'none'}`,
      `ship.autoFinish = ${ship.autoFinish}`,
    ];
    const codex = delegation && delegation.codex;
    const pins = TICKET_MODELS.map((tier) => [tier, pinnedCodexModel(tier, config)]).filter(([, pin]) => pin);
    settings.push(`delegation.codex.models = ${pins.length ? pins.map(([tier, pin]) => `${tier}: ${pin.model}`).join(', ') : 'none (the parent picks from its spawn tool)'}`);
    if (codex && codex.inheritEfforts) settings.push('⚠️  delegation.codex.inheritEfforts is no longer read; you can remove it.');
    const githubExtra = github.stored && !github.detected.enabled
      ? '⚠️  Applying turns GitHub off: a hand-forced true (e.g. GitHub Enterprise) would be lost.'
      : null;

    const lines = [
      ...describeFlag('github', 'GitHub', file, github, { rescan: options.rescan, extraDiffers: githubExtra }),
      ...describeFlag('jev', 'Jev', file, jev, { rescan: options.rescan }),
      ...settings,
    ];
    return { text: lines.join('\n'), data };
  },
});
