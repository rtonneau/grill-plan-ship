#!/usr/bin/env node

/**
 * /gps write
 *
 * Detects which phase (grill or plan) still needs its output written to
 * disk and prints the paths Claude should fill in. Does not write content
 * itself — that's synthesized from the conversation by Claude Code.
 */

const { resolveWriteTarget } = require('./lib/write-target');
const { resolveSession } = require('./lib/session-store');
const { touchPhase, computeUsage } = require('./lib/token-usage');
const { writeJsonAtomic, runCli } = require('./lib/guard');

runCli(() => {
  const { sessionId, sessionDir, configPath, config } = resolveSession(process.cwd());
  const result = resolveWriteTarget(sessionDir);

  if (result.target === 'grill' || result.target === 'plan') {
    touchPhase(config, result.target);
    writeJsonAtomic(configPath, config);
    result.tokenUsage = computeUsage(config, result.target);
  }

  console.log(JSON.stringify({ sessionId, sessionDir, ...result }, null, 2));
});
