#!/usr/bin/env node

/**
 * /gps resume
 *
 * Reads the current session's HANDOFF.md (if any) plus freshly computed
 * live state (ticket queue, git log, git status), and reports both plus
 * any drift between what the handoff said and what's true now. Read-only:
 * mutates nothing.
 */

const path = require('path');
const { getCurrentSessionId } = require('./lib/session-store');
const { buildResumeReport } = require('./lib/resume');

function main() {
  const projectRoot = process.cwd();
  const sessionsDir = path.join(projectRoot, '.work', 'sessions');
  const currentSession = getCurrentSessionId(sessionsDir);

  if (!currentSession) {
    console.error('No sessions found. Run /gps start first.');
    process.exit(1);
  }

  const sessionDir = path.join(sessionsDir, currentSession);
  const report = buildResumeReport(sessionDir, projectRoot);

  console.log(JSON.stringify(report, null, 2));
}

main();
