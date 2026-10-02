#!/usr/bin/env node

/**
 * /gps status
 *
 * Prints a snapshot of every session under .work/sessions/ and every
 * scouted idea not started yet (.pending-seeds.json), plus a
 * detailed breakdown of the current session (pending phase, ticket
 * queue, recent commits), so Claude Code can reorient after returning
 * to a project or losing context. Read-only: mutates nothing.
 */

const fs = require('fs');
const path = require('path');
const { buildStatusReport } = require('./lib/status');
const { GpsError, runCli } = require('./lib/guard');

runCli(() => {
  const projectRoot = process.cwd();
  const sessionsDir = path.join(projectRoot, '.work', 'sessions');
  const noSessions = new GpsError('No sessions found.', 'Run /gps start <feature-name> (or /gps scout for ideas) first.');

  if (!fs.existsSync(sessionsDir)) throw noSessions;
  const report = buildStatusReport(sessionsDir, projectRoot);
  if (report.sessions.length === 0 && report.ideas.length === 0 && !report.ideasProblem) throw noSessions;

  console.log(JSON.stringify(report, null, 2));
});
