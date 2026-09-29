// scripts/lib/clean.js
//
// /gps clean: lists sessions with their idleness, and deletes named ones.
// Only session directories are removed: never .current-session,
// .pending-seeds.json, git branches, pull requests or issues.

const fs = require('fs');
const path = require('path');
const { GpsError } = require('./guard');
const {
  CURRENT_SESSION_FILENAME, listSessionDirs, isSafeSessionName, isFinished,
} = require('./session-store');
const { computeIdleness } = require('./staleness');

function readConfig(sessionsDir, sessionId) {
  try {
    return JSON.parse(fs.readFileSync(path.join(sessionsDir, sessionId, '.session-config.json'), 'utf-8'));
  } catch (_err) {
    return null;
  }
}

// The raw pointer, even when it names a finished or missing session.
function readCurrentPointer(sessionsDir) {
  try {
    return fs.readFileSync(path.join(sessionsDir, CURRENT_SESSION_FILENAME), 'utf-8').trim();
  } catch (_err) {
    return null;
  }
}

function countImplementDirs(sessionDir) {
  try {
    return fs.readdirSync(path.join(sessionDir, '03-implement'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory()).length;
  } catch (_err) {
    return 0;
  }
}

// Every session, most idle first (sessions without a date last).
function listCleanable(sessionsDir, now = new Date()) {
  const current = readCurrentPointer(sessionsDir);
  return listSessionDirs(sessionsDir)
    .map((sessionId) => {
      const config = readConfig(sessionsDir, sessionId);
      return {
        sessionId,
        featureName: config ? config.feature_name || null : null,
        finished: Boolean(config) && isFinished(config),
        current: sessionId === current,
        deletable: sessionId !== current,
        ticketsStarted: countImplementDirs(path.join(sessionsDir, sessionId)),
        branch: config && config.git ? config.git.branch || null : null,
        prUrl: config && config.git ? config.git.pr_url || null : null,
        issueUrl: config && config.issue ? config.issue.url || null : null,
        ...computeIdleness(sessionsDir, sessionId, config, now),
      };
    })
    .sort((a, b) => (b.idleDays === null ? -1 : b.idleDays) - (a.idleDays === null ? -1 : a.idleDays));
}

// Validates every id first; deletes only when all pass. Returns the removed ids.
function deleteSessions(sessionsDir, sessionIds) {
  const available = () => listSessionDirs(sessionsDir).join(', ') || 'none';
  const current = readCurrentPointer(sessionsDir);
  const unique = [...new Set(sessionIds)];

  for (const sessionId of unique) {
    if (!isSafeSessionName(sessionId)) {
      throw new GpsError(`Invalid session id: ${JSON.stringify(sessionId)}`, `Sessions: ${available()}`);
    }
    if (!listSessionDirs(sessionsDir).includes(sessionId)) {
      throw new GpsError(`Session ${sessionId} not found.`, `Sessions: ${available()}`);
    }
    if (sessionId === current) {
      throw new GpsError(`Session ${sessionId} is the current session.`,
        'Switch first with node $CLAUDE_PLUGIN_ROOT/scripts/set-current.js <session-id>, then clean it.');
    }
  }
  for (const sessionId of unique) {
    fs.rmSync(path.join(sessionsDir, sessionId), { recursive: true, force: true });
  }
  return unique;
}

module.exports = { listCleanable, deleteSessions };
