#!/usr/bin/env node

/**
 * /gps status
 *
 * Prints a snapshot of every session under .work/sessions/, plus a
 * detailed breakdown of the current session (pending phase, ticket
 * queue, recent commits), so Claude Code can reorient after returning
 * to a project or losing context. Read-only: mutates nothing.
 */

const fs = require('fs');
const path = require('path');
const { buildStatusReport } = require('./lib/status');

function main() {
  const projectRoot = process.cwd();
  const sessionsDir = path.join(projectRoot, '.work', 'sessions');

  if (!fs.existsSync(sessionsDir)) {
    console.error('No sessions found. Run /gps start first.');
    process.exit(1);
  }

  const report = buildStatusReport(sessionsDir, projectRoot);

  if (report.sessions.length === 0) {
    console.error('No sessions found. Run /gps start first.');
    process.exit(1);
  }

  console.log(JSON.stringify(report, null, 2));
}

main();
