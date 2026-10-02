#!/usr/bin/env node

/**
 * status.js [--json]
 *
 * /gps status: every session (phase, branch/PR/issue, staleness, phase
 * drift), every scouted idea not started yet, and for the current session
 * its phase, tickets, recent commits and saved handoff (with drift against
 * live state), ending with the next command to run. Read-only.
 */

const fs = require('fs');
const { main } = require('./lib/cli');
const { sessionsDirOf } = require('./lib/session-store');
const { buildStatusReport, renderStatus } = require('./lib/status');
const { GpsError } = require('./lib/guard');

main({
  usage: 'status.js [--json]',
  run({ projectRoot }) {
    const sessionsDir = sessionsDirOf(projectRoot);
    const noSessions = new GpsError('No sessions found.', 'Run /gps start <feature-name> (or /gps scout for ideas) first.');
    if (!fs.existsSync(sessionsDir)) throw noSessions;
    const report = buildStatusReport(sessionsDir, projectRoot);
    if (report.sessions.length === 0 && report.ideas.length === 0 && !report.ideasProblem) throw noSessions;
    return { text: renderStatus(report), data: report };
  },
});
