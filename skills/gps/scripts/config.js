#!/usr/bin/env node

/**
 * /gps config
 *
 *   node config.js                    show .work/gps-config.json and what detection finds now (read-only)
 *   node config.js --rescan           detect GitHub again; writes only when the value is unchanged
 *   node config.js --rescan --apply   write the newly detected value
 *
 * Claude runs --rescan --apply only after the user has confirmed the change in chat.
 */

const path = require('path');
const { CONFIG_FILENAME, rescanProjectConfig } = require('./lib/project-config');
const { GpsError, runCli } = require('./lib/guard');

const USAGE = 'Usage: node config.js, node config.js --rescan or node config.js --rescan --apply';
const SCOPE_NOTE = 'The flag applies to sessions whose plan is not saved yet; sessions already planned keep their current mode.';

const onOff = (value) => (value ? 'on' : 'off');

runCli(() => {
  const args = process.argv.slice(2);
  const rescan = args[0] === '--rescan';
  const apply = rescan && args[1] === '--apply';
  if (args.length > (apply ? 2 : rescan ? 1 : 0)) {
    throw new GpsError(`Unexpected arguments: ${args.join(' ')}`, USAGE);
  }

  const projectRoot = process.cwd();
  const file = path.join('.work', CONFIG_FILENAME);
  const { status, stored, storedAt, detected } = rescanProjectConfig(projectRoot, { apply, check: !rescan });
  const now = `GitHub detected now: ${onOff(detected.enabled)} (${detected.reason})`;

  if (status === 'created') {
    console.log(`✅ Created ${file}: github.enabled = ${detected.enabled}`);
    console.log(now);
    return;
  }

  console.log(`${file}: github.enabled = ${stored} (detected_at ${storedAt || 'unknown'})`);
  console.log(now);

  if (status === 'unchanged') {
    console.log(rescan ? '✅ Unchanged; detected_at refreshed.' : '✅ Stored value matches detection.');
  } else if (status === 'differs') {
    console.log(`⚠️  Stored value differs: github.enabled ${stored} → ${detected.enabled}. Nothing was changed.`);
    console.log(rescan
      ? 'Next: confirm with the user, then run node config.js --rescan --apply.'
      : 'Next: /gps config --rescan to update it.');
    console.log(SCOPE_NOTE);
  } else {
    console.log(`✅ Updated: github.enabled ${stored} → ${detected.enabled}.`);
    console.log(SCOPE_NOTE);
  }
});
