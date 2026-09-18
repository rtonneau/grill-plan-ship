#!/usr/bin/env node

/**
 * /gps write
 *
 * Detects which phase (grill or plan) still needs its output written to
 * disk and prints the paths Claude should fill in. Does not write content
 * itself — that's synthesized from the conversation by Claude Code.
 */

const fs = require('fs');
const path = require('path');
const { resolveWriteTarget } = require('./lib/write-target');
const { getCurrentSessionId } = require('./lib/session-store');
const { touchPhase, computeUsage } = require('./lib/token-usage');

function main() {
  const projectRoot = process.cwd();
  const sessionsDir = path.join(projectRoot, '.work', 'sessions');

  if (!fs.existsSync(sessionsDir)) {
    console.error('No sessions found. Run /gps start first.');
    process.exit(1);
  }

  const currentSession = getCurrentSessionId(sessionsDir);
  if (!currentSession) {
    console.error('No sessions found. Run /gps start first.');
    process.exit(1);
  }

  const sessionDir = path.join(sessionsDir, currentSession);
  const result = resolveWriteTarget(sessionDir);

  if (result.target === 'grill' || result.target === 'plan') {
    const configPath = path.join(sessionDir, '.session-config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    touchPhase(config, result.target);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    result.tokenUsage = computeUsage(config, result.target);
  }

  console.log(JSON.stringify({ sessionId: currentSession, sessionDir, ...result }, null, 2));
}

main();
