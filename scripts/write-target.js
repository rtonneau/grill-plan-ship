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

  console.log(JSON.stringify({ sessionId: currentSession, sessionDir, ...result }, null, 2));
}

main();
