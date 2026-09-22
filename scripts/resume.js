#!/usr/bin/env node

/**
 * /gps resume
 *
 * Reads the current session's HANDOFF.md (if any) plus freshly computed
 * live state (ticket queue, git log, git status), and reports both plus
 * any drift between what the handoff said and what's true now. Read-only:
 * mutates nothing.
 */

const { resolveSession } = require('./lib/session-store');
const { buildResumeReport } = require('./lib/resume');
const { runCli } = require('./lib/guard');

runCli(() => {
  const projectRoot = process.cwd();
  const { sessionDir } = resolveSession(projectRoot);
  const report = buildResumeReport(sessionDir, projectRoot);

  console.log(JSON.stringify(report, null, 2));
});
