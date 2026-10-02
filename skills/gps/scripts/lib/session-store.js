// skills/gps/scripts/lib/session-store.js
//
// Where sessions live (.work/sessions/<id>/.session-config.json) and which
// one is current (.work/sessions/.current-session). Never falls back to
// "the most recent session": a bad pointer is an error with a hint.

const fs = require('fs');
const path = require('path');
const { GpsError, readJson, readJsonOrNull } = require('./guard');
const { isFinished } = require('./phase');

const CURRENT_SESSION_FILENAME = '.current-session';
const CONFIG_FILENAME = '.session-config.json';
// Script names in hints follow the references' convention: SKILL.md maps
// `<name>.js` to the full node command.
const SET_CURRENT = 'set-current.js <session-id>';

function sessionsDirOf(projectRoot) {
  return path.join(projectRoot, '.work', 'sessions');
}

function setCurrentSession(sessionsDir, sessionId) {
  fs.writeFileSync(path.join(sessionsDir, CURRENT_SESSION_FILENAME), sessionId, 'utf-8');
}

function clearCurrentSession(sessionsDir) {
  fs.rmSync(path.join(sessionsDir, CURRENT_SESSION_FILENAME), { force: true });
}

// Session ids (directories holding a config), in directory order.
function listSessionDirs(sessionsDir) {
  if (!fs.existsSync(sessionsDir)) return [];
  return fs.readdirSync(sessionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => fs.existsSync(path.join(sessionsDir, entry.name, CONFIG_FILENAME)))
    .map((entry) => entry.name);
}

// A session's parsed config, or null when it is missing or unreadable.
function readConfigOrNull(sessionsDir, sessionId) {
  return readJsonOrNull(path.join(sessionsDir, sessionId, CONFIG_FILENAME));
}

// The raw pointer, even when it names a finished or missing session.
function readCurrentPointer(sessionsDir) {
  try {
    return fs.readFileSync(path.join(sessionsDir, CURRENT_SESSION_FILENAME), 'utf-8').trim();
  } catch (_err) {
    return null;
  }
}

// Sessions that /gps finish has not closed, newest first.
function listUnfinishedSessions(sessionsDir) {
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
  if (listSessionDirs(sessionsDir).length === 0) return { sessionId: null, problem: 'no-sessions' };
  const sessionId = readCurrentPointer(sessionsDir);
  if (sessionId === null) return { sessionId: null, problem: 'no-pointer' };
  if (!isSafeSessionName(sessionId)) return { sessionId: null, problem: 'invalid-pointer', pointer: sessionId };
  if (!fs.existsSync(path.join(sessionsDir, sessionId, CONFIG_FILENAME))) {
    return { sessionId: null, problem: 'missing-session', pointer: sessionId };
  }
  if (isFinished(readConfigOrNull(sessionsDir, sessionId))) {
    return { sessionId: null, problem: 'finished-session', pointer: sessionId };
  }
  return { sessionId, problem: null };
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
      `${SET_CURRENT} (or /gps start <feature-name> for a new one).`;
  return new GpsError(message, hint);
}

// Resolves the current session for a handler, or throws a GpsError with a
// recovery hint. Returns paths plus the parsed config.
function resolveSession(projectRoot) {
  const sessionsDir = sessionsDirOf(projectRoot);
  const pointer = resolveCurrentPointer(sessionsDir);
  if (pointer.problem) throw pointerError(sessionsDir, pointer);
  const { sessionId } = pointer;

  const sessionDir = path.join(sessionsDir, sessionId);
  const configPath = path.join(sessionDir, CONFIG_FILENAME);
  const config = readJson(configPath, `.session-config.json of ${sessionId}`);
  return { sessionsDir, sessionId, sessionDir, configPath, config };
}

module.exports = {
  CURRENT_SESSION_FILENAME,
  CONFIG_FILENAME,
  SET_CURRENT,
  sessionsDirOf,
  setCurrentSession,
  clearCurrentSession,
  listUnfinishedSessions,
  listSessionDirs,
  readConfigOrNull,
  readCurrentPointer,
  isSafeSessionName,
  resolveCurrentPointer,
  pointerError,
  resolveSession,
};
