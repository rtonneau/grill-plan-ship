// scripts/lib/session-store.js
const fs = require('fs');
const path = require('path');
const { GpsError, readJson } = require('./guard');

const CURRENT_SESSION_FILENAME = '.current-session';

function setCurrentSession(sessionsDir, sessionId) {
  fs.writeFileSync(path.join(sessionsDir, CURRENT_SESSION_FILENAME), sessionId, 'utf-8');
}

function clearCurrentSession(sessionsDir) {
  fs.rmSync(path.join(sessionsDir, CURRENT_SESSION_FILENAME), { force: true });
}

function listSessionDirs(sessionsDir) {
  return fs.readdirSync(sessionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => fs.existsSync(path.join(sessionsDir, entry.name, '.session-config.json')))
    .map((entry) => entry.name);
}

function readConfigOrNull(sessionsDir, sessionId) {
  const configPath = path.join(sessionsDir, sessionId, '.session-config.json');
  if (!fs.existsSync(configPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (_err) {
    return null;
  }
}

function isFinished(config) {
  return Boolean(config && (config.finished_at || config.status === 'completed'));
}

// Sessions that /gps finish has not closed, newest first.
function listUnfinishedSessions(sessionsDir) {
  if (!fs.existsSync(sessionsDir)) return [];
  return listSessionDirs(sessionsDir)
    .map((sessionId) => ({ sessionId, config: readConfigOrNull(sessionsDir, sessionId) }))
    .filter(({ config }) => !isFinished(config))
    .map(({ sessionId, config }) => ({
      sessionId,
      featureName: config ? config.feature_name : null,
      createdAt: config ? config.created_at : null,
    }))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

// A session id must be a single plain directory name (no separators, not
// "." or ".."). Sessions created before slug cleaning may not match the
// strict slug rule, so this only rules out path tricks.
function isSafeSessionName(sessionId) {
  return typeof sessionId === 'string'
    && sessionId !== '' && sessionId !== '.' && sessionId !== '..'
    && !/[\\/]/.test(sessionId)
    && path.basename(sessionId) === sessionId;
}

// Reads .current-session and checks it. Never falls back to another
// session. Returns { sessionId, problem } where problem is one of
// null | 'no-sessions' | 'no-pointer' | 'invalid-pointer' |
// 'missing-session' | 'finished-session'.
function resolveCurrentPointer(sessionsDir) {
  if (!fs.existsSync(sessionsDir) || listSessionDirs(sessionsDir).length === 0) {
    return { sessionId: null, problem: 'no-sessions' };
  }
  const pointerPath = path.join(sessionsDir, CURRENT_SESSION_FILENAME);
  if (!fs.existsSync(pointerPath)) return { sessionId: null, problem: 'no-pointer' };

  const sessionId = fs.readFileSync(pointerPath, 'utf-8').trim();
  if (!isSafeSessionName(sessionId)) return { sessionId: null, problem: 'invalid-pointer', pointer: sessionId };
  if (!fs.existsSync(path.join(sessionsDir, sessionId, '.session-config.json'))) {
    return { sessionId: null, problem: 'missing-session', pointer: sessionId };
  }
  if (isFinished(readConfigOrNull(sessionsDir, sessionId))) {
    return { sessionId: null, problem: 'finished-session', pointer: sessionId };
  }
  return { sessionId, problem: null };
}

function getCurrentSessionId(sessionsDir) {
  return resolveCurrentPointer(sessionsDir).sessionId;
}

const POINTER_MESSAGES = {
  'no-sessions': () => 'No sessions found.',
  'no-pointer': () => 'No current session is selected.',
  'invalid-pointer': (p) => `.work/sessions/.current-session holds an invalid session id: ${JSON.stringify(p)}.`,
  'missing-session': (p) => `The current session ${p} no longer exists (no .session-config.json).`,
  'finished-session': (p) => `The current session ${p} is already finished.`,
};

// Turns a resolveCurrentPointer() problem into a GpsError with a recovery hint.
function pointerError(sessionsDir, { problem, pointer }) {
  const message = POINTER_MESSAGES[problem](pointer);
  if (problem === 'no-sessions') return new GpsError(message, 'Run /gps start <feature-name> first.');

  const unfinished = listUnfinishedSessions(sessionsDir).map((s) => s.sessionId);
  const hint = unfinished.length === 0
    ? 'There are no unfinished sessions. Run /gps start <feature-name>.'
    : `Unfinished sessions: ${unfinished.join(', ')}. Ask the user which one to use, then run ` +
      'node $CLAUDE_PLUGIN_ROOT/scripts/set-current.js <session-id> (or /gps start <feature-name> for a new one).';
  return new GpsError(message, hint);
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
  const pointer = resolveCurrentPointer(sessionsDir);
  if (pointer.problem) throw pointerError(sessionsDir, pointer);
  const { sessionId } = pointer;

  const sessionDir = path.join(sessionsDir, sessionId);
  const configPath = path.join(sessionDir, '.session-config.json');
  const config = readJson(configPath, `.session-config.json of ${sessionId}`);
  return { sessionsDir, sessionId, sessionDir, configPath, config };
}

module.exports = {
  CURRENT_SESSION_FILENAME,
  setCurrentSession,
  clearCurrentSession,
  isFinished,
  listUnfinishedSessions,
  listSessionDirs,
  isSafeSessionName,
  resolveCurrentPointer,
  pointerError,
  getCurrentSessionId,
  markPhaseCompleted,
  resolveSession,
};
