#!/usr/bin/env node

/**
 * Called by /gps write after it has filled in 02-plan/plan.md and the
 * real ticket files, to record that the plan phase is done.
 */

const fs = require('fs');
const path = require('path');
const { getCurrentSessionId, markPhaseCompleted } = require('./lib/session-store');

function main() {
  const projectRoot = process.cwd();
  const sessionsDir = path.join(projectRoot, '.work', 'sessions');
  const currentSession = getCurrentSessionId(sessionsDir);

  if (!currentSession) {
    console.error('No sessions found. Run /gps start first.');
    process.exit(1);
  }

  const configPath = path.join(sessionsDir, currentSession, '.session-config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  markPhaseCompleted(config, 'plan');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  console.log(`Marked plan phase complete for ${currentSession}`);
}

main();
