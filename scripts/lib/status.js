// scripts/lib/status.js
const fs = require('fs');
const path = require('path');
const { listSessionDirs, resolveCurrentPointer, pointerError } = require('./session-store');
const { resolveWriteTarget } = require('./write-target');
const { listTickets } = require('./ticket-queue');
const { readRecentCommits } = require('./git');

function readConfig(sessionsDir, sessionId) {
  const configPath = path.join(sessionsDir, sessionId, '.session-config.json');
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (_err) {
    return null;
  }
}

function summarizeSession(sessionsDir, sessionId) {
  const config = readConfig(sessionsDir, sessionId);
  return {
    sessionId,
    featureName: config ? config.feature_name : null,
    createdAt: config ? config.created_at : null,
    status: config ? config.status : null,
    phasesCompleted: config ? config.phases_completed || [] : [],
  };
}

function buildStatusReport(sessionsDir, projectRoot) {
  const sessionIds = listSessionDirs(sessionsDir);
  const sessions = sessionIds.map((sessionId) => summarizeSession(sessionsDir, sessionId));

  const pointer = resolveCurrentPointer(sessionsDir);
  if (pointer.problem) {
    const { message, hint } = pointerError(sessionsDir, pointer);
    return { sessions, current: null, currentProblem: { code: pointer.problem, message, hint } };
  }
  const currentSessionId = pointer.sessionId;

  const sessionDir = path.join(sessionsDir, currentSessionId);
  const writeTarget = resolveWriteTarget(sessionDir);
  const { tickets, nextPending } = listTickets(sessionDir);
  const config = readConfig(sessionsDir, currentSessionId);
  const gitLog = readRecentCommits(projectRoot, config ? config.created_at : null);
  const hasHandoff = fs.existsSync(path.join(sessionDir, 'HANDOFF.md'));

  return {
    sessions,
    current: {
      sessionId: currentSessionId,
      writeTarget,
      tickets,
      nextPending,
      gitLog,
      hasHandoff,
    },
  };
}

module.exports = { buildStatusReport };
