// scripts/lib/status.js
const fs = require('fs');
const path = require('path');
const { listSessionDirs, resolveCurrentPointer, pointerError } = require('./session-store');
const { computeSessionState } = require('./phase');
const { readRecentCommits } = require('./git');

function readConfig(sessionsDir, sessionId) {
  const configPath = path.join(sessionsDir, sessionId, '.session-config.json');
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (_err) {
    return null;
  }
}

// Phase is computed from the session's files; status / phases_completed
// fields in older configs are ignored.
function summarizeSession(sessionsDir, sessionId) {
  const config = readConfig(sessionsDir, sessionId);
  const { phase } = computeSessionState(path.join(sessionsDir, sessionId), config);
  return {
    sessionId,
    featureName: config ? config.feature_name : null,
    createdAt: config ? config.created_at : null,
    finishedAt: config ? config.finished_at || null : null,
    phase,
    configReadable: Boolean(config),
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
  const config = readConfig(sessionsDir, currentSessionId);
  const { writeTarget, ticketQueue, phase, suggestedNext } = computeSessionState(sessionDir, config);
  const gitLog = readRecentCommits(projectRoot, config ? config.created_at : null);
  const hasHandoff = fs.existsSync(path.join(sessionDir, 'HANDOFF.md'));

  return {
    sessions,
    current: {
      sessionId: currentSessionId,
      phase,
      suggestedNext,
      writeTarget,
      tickets: ticketQueue.tickets,
      nextPending: ticketQueue.nextPending,
      skippedTicketFiles: ticketQueue.skipped,
      gitLog,
      hasHandoff,
    },
  };
}

module.exports = { buildStatusReport };
