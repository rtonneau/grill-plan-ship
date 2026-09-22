// scripts/lib/session-store.js
const fs = require('fs');
const path = require('path');
const { GpsError, readJson } = require('./guard');

const CURRENT_SESSION_FILENAME = '.current-session';

function setCurrentSession(sessionsDir, sessionId) {
  fs.writeFileSync(path.join(sessionsDir, CURRENT_SESSION_FILENAME), sessionId, 'utf-8');
}

function listSessionDirs(sessionsDir) {
  return fs.readdirSync(sessionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => fs.existsSync(path.join(sessionsDir, entry.name, '.session-config.json')))
    .map((entry) => entry.name);
}

function readCreatedAt(sessionsDir, sessionId) {
  const configPath = path.join(sessionsDir, sessionId, '.session-config.json');
  if (!fs.existsSync(configPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8')).created_at || null;
  } catch (_err) {
    return null;
  }
}

function mostRecentByCreatedAt(sessionsDir) {
  const sessions = listSessionDirs(sessionsDir);
  if (sessions.length === 0) return null;

  const withTimestamps = sessions.map((name) => ({
    name,
    createdAt: readCreatedAt(sessionsDir, name),
  }));

  withTimestamps.sort((a, b) => {
    if (a.createdAt && b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
    if (a.createdAt) return -1;
    if (b.createdAt) return 1;
    return a.name < b.name ? 1 : -1;
  });

  return withTimestamps[0].name;
}

function getCurrentSessionId(sessionsDir) {
  const pointerPath = path.join(sessionsDir, CURRENT_SESSION_FILENAME);
  if (fs.existsSync(pointerPath)) {
    const sessionId = fs.readFileSync(pointerPath, 'utf-8').trim();
    if (sessionId && fs.existsSync(path.join(sessionsDir, sessionId))) {
      return sessionId;
    }
  }
  return mostRecentByCreatedAt(sessionsDir);
}

function markPhaseCompleted(config, phase) {
  if (!Array.isArray(config.phases_completed)) config.phases_completed = [];
  if (!config.phases_completed.includes(phase)) {
    config.phases_completed.push(phase);
  }
}

// Resolves the current session for a handler, or throws a GpsError with a
// recovery hint. Returns paths plus the parsed config.
function resolveSession(projectRoot) {
  const sessionsDir = path.join(projectRoot, '.work', 'sessions');
  const noSessions = new GpsError('No sessions found.', 'Run /gps start <feature-name> first.');
  if (!fs.existsSync(sessionsDir)) throw noSessions;

  const sessionId = getCurrentSessionId(sessionsDir);
  if (!sessionId) throw noSessions;

  const sessionDir = path.join(sessionsDir, sessionId);
  const configPath = path.join(sessionDir, '.session-config.json');
  const config = readJson(configPath, `.session-config.json of ${sessionId}`);
  return { sessionsDir, sessionId, sessionDir, configPath, config };
}

module.exports = {
  CURRENT_SESSION_FILENAME,
  setCurrentSession,
  listSessionDirs,
  getCurrentSessionId,
  markPhaseCompleted,
  resolveSession,
};
