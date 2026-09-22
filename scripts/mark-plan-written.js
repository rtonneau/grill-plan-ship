#!/usr/bin/env node

/**
 * Called by /gps write after it has filled in 02-plan/plan.md and the
 * real ticket files, to record that the plan phase is done.
 */

const { resolveSession, markPhaseCompleted } = require('./lib/session-store');
const { writeJsonAtomic, runCli } = require('./lib/guard');

runCli(() => {
  const { sessionId, configPath, config } = resolveSession(process.cwd());
  markPhaseCompleted(config, 'plan');
  writeJsonAtomic(configPath, config);
  console.log(`✅ Marked plan phase complete for ${sessionId}`);
});
