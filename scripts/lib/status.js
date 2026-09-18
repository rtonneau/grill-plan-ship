// scripts/lib/status.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { listSessionDirs, getCurrentSessionId } = require('./session-store');
const { resolveWriteTarget } = require('./write-target');
const { listTickets } = require('./ticket-queue');

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

function readRecentCommits(projectRoot, sessionDir) {
  const relPath = path.relative(projectRoot, sessionDir);
  try {
    const output = execSync(`git log --oneline -n 5 -- "${relPath}"`, {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output.split('\n').map((line) => line.trim()).filter(Boolean);
  } catch (_err) {
    return [];
  }
}

function buildStatusReport(sessionsDir, projectRoot) {
  const sessionIds = listSessionDirs(sessionsDir);
  const sessions = sessionIds.map((sessionId) => summarizeSession(sessionsDir, sessionId));

  const currentSessionId = getCurrentSessionId(sessionsDir);
  if (!currentSessionId) {
    return { sessions, current: null };
  }

  const sessionDir = path.join(sessionsDir, currentSessionId);
  const writeTarget = resolveWriteTarget(sessionDir);
  const { tickets, nextPending } = listTickets(sessionDir);
  const gitLog = readRecentCommits(projectRoot, sessionDir);

  return {
    sessions,
    current: {
      sessionId: currentSessionId,
      writeTarget,
      tickets,
      nextPending,
      gitLog,
    },
  };
}

module.exports = { buildStatusReport };
