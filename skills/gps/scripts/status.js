#!/usr/bin/env node

/**
 * status.js [--json]
 *
 * /gps status: every session (phase, branch/PR/issue, staleness, phase
 * drift), every scouted seed not started yet, and for the current session
 * its phase, tickets, recent commits and saved handoff (with drift against
 * live state), ending with the next command to run. Read-only.
 */

const fs = require('fs');
const path = require('path');
const { main } = require('./lib/cli');
const { sessionsDirOf, readCurrentPointer, readConfigOrNull } = require('./lib/session-store');
const { listWorktrees } = require('./lib/git');
const { buildStatusReport, renderStatus } = require('./lib/status');
const { GpsError } = require('./lib/guard');

function sameDirectory(left, right) {
  const leftStat = fs.statSync(left);
  const rightStat = fs.statSync(right);
  if (leftStat.ino !== 0 && rightStat.ino !== 0) {
    return leftStat.dev === rightStat.dev && leftStat.ino === rightStat.ino;
  }
  const leftPath = fs.realpathSync(left);
  const rightPath = fs.realpathSync(right);
  return process.platform === 'win32'
    ? leftPath.toLowerCase() === rightPath.toLowerCase()
    : leftPath === rightPath;
}

// Unfinished gps sessions current in the repository's other worktrees.
function otherWorktreeSessions(projectRoot) {
  return listWorktrees(projectRoot)
    .filter((wt) => fs.existsSync(wt.path) && !sameDirectory(wt.path, projectRoot))
    .map((wt) => {
      const sessionsDir = sessionsDirOf(wt.path);
      const sessionId = readCurrentPointer(sessionsDir);
      const config = sessionId && readConfigOrNull(sessionsDir, sessionId);
      return config && !config.finished_at ? { ...wt, sessionId, phase: config.current_phase || null } : null;
    })
    .filter(Boolean);
}

// The other worktrees' sessions, listed before the closing Next: line.
function withWorktrees(text, worktrees) {
  if (worktrees.length === 0) return text;
  const section = ['## Sessions in other worktrees', '',
    ...worktrees.map((wt) => `- ${wt.sessionId} (${wt.phase || 'unknown phase'}) on ${wt.branch || 'a detached HEAD'}: ${wt.path}`),
    '', 'Run gps commands for those sessions from their worktree.', '', ''].join('\n');
  const at = text.lastIndexOf('\nNext: ');
  return at === -1 ? `${text}\n\n${section}` : `${text.slice(0, at + 1)}${section}${text.slice(at + 1)}`;
}

main({
  usage: 'status.js [--json]',
  run({ projectRoot }) {
    const sessionsDir = sessionsDirOf(projectRoot);
    const noSessions = new GpsError('No sessions found.', 'Run /gps start <feature-name> (or /gps scout for seeds) first.');
    if (!fs.existsSync(sessionsDir)) throw noSessions;
    const report = buildStatusReport(sessionsDir, projectRoot);
    if (report.sessions.length === 0 && report.seeds.length === 0 && !report.seedsProblem) throw noSessions;
    report.worktrees = otherWorktreeSessions(projectRoot);
    return { text: withWorktrees(renderStatus(report), report.worktrees), data: report };
  },
});
