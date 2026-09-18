#!/usr/bin/env node

/**
 * node token-usage.js <phaseKey>
 *
 * Prints computed token usage for one phase of the current session as
 * JSON. Used by /gps ship right before it fills in a ticket's
 * commit-log.md, since ticket finalization has no other script call to
 * hang this off of (unlike grill/plan, which get it from write-target.js).
 */

const fs = require('fs');
const path = require('path');
const { computeUsage } = require('./lib/token-usage');
const { getCurrentSessionId } = require('./lib/session-store');

function main() {
  const phaseKey = process.argv[2];
  if (!phaseKey) {
    console.error('Usage: node token-usage.js <phaseKey>');
    process.exit(1);
  }

  const projectRoot = process.cwd();
  const sessionsDir = path.join(projectRoot, '.work', 'sessions');
  const currentSession = getCurrentSessionId(sessionsDir);

  if (!currentSession) {
    console.error('No sessions found. Run /gps start first.');
    process.exit(1);
  }

  const configPath = path.join(sessionsDir, currentSession, '.session-config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  console.log(JSON.stringify(computeUsage(config, phaseKey), null, 2));
}

main();
