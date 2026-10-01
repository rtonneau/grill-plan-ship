// scripts/lib/clean.js
//
// /gps clean: lists sessions with their idleness and the scouted ideas not
// started yet, and deletes named ones. Only session directories and entries
// of .pending-seeds.json are removed: never .current-session, scout reports,
// git branches, pull requests or issues.

const fs = require('fs');
const path = require('path');
const { GpsError } = require('./guard');
const {
  CURRENT_SESSION_FILENAME, listSessionDirs, isSafeSessionName, isFinished,
} = require('./session-store');
const { computeIdleness } = require('./staleness');
const { SEEDS_FILENAME, peekSeeds, removeSeeds } = require('./seeds-store');

const DAY_MS = 24 * 60 * 60 * 1000;

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

// Scouted ideas not started yet, oldest first. { ideas, problem }: problem is
// why .pending-seeds.json is unreadable (then ideas is empty), else null.
function listIdeas(sessionsDir, now = new Date()) {
  const { seeds, problem } = peekSeeds(sessionsDir);
  const ideas = Object.entries(seeds).map(([slug, seed]) => {
    const entry = seed || {};
    const time = entry.createdAt ? Date.parse(entry.createdAt) : NaN;
    return {
      slug,
      problem: entry.problem || null,
      strength: entry.strength || null,
      sourceReport: entry.sourceReport || null,
      createdAt: entry.createdAt || null,
      idleDays: Number.isNaN(time) ? null : Math.max(0, Math.floor((now.getTime() - time) / DAY_MS)),
    };
  });
  ideas.sort((a, b) => (b.idleDays === null ? -1 : b.idleDays) - (a.idleDays === null ? -1 : a.idleDays));
  return { ideas, problem };
}

// Each id names a session directory or, failing that, a scouted idea.
// Validates every id first; changes nothing unless all pass. Returns
// { sessions, ideas }: the removed session ids and idea slugs.
function deleteEntries(sessionsDir, ids) {
  const sessionIds = listSessionDirs(sessionsDir);
  const { seeds, problem } = peekSeeds(sessionsDir);
  const available = () => `Sessions: ${sessionIds.join(', ') || 'none'}. Ideas: ${Object.keys(seeds).join(', ') || 'none'}.`;
  const current = readCurrentPointer(sessionsDir);
  const sessions = [];
  const ideas = [];

  for (const id of new Set(ids)) {
    if (!isSafeSessionName(id)) {
      throw new GpsError(`Invalid session or idea id: ${JSON.stringify(id)}`, available());
    }
    if (sessionIds.includes(id)) {
      if (id === current) {
        throw new GpsError(`Session ${id} is the current session.`,
          'Switch first with node $CLAUDE_PLUGIN_ROOT/scripts/set-current.js <session-id>, then clean it.');
      }
      sessions.push(id);
    } else if (problem) {
      throw new GpsError(`${id} is not a session, and ${SEEDS_FILENAME} is unreadable (${problem}).`,
        'Run /gps scout to move the file aside and start fresh, or fix it by hand.');
    } else if (Object.prototype.hasOwnProperty.call(seeds, id)) {
      ideas.push(id);
    } else {
      throw new GpsError(`${id} is neither a session nor a scouted idea.`, available());
    }
  }

  for (const id of sessions) {
    fs.rmSync(path.join(sessionsDir, id), { recursive: true, force: true });
  }
  if (ideas.length > 0) removeSeeds(sessionsDir, ideas);
  return { sessions, ideas };
}

module.exports = { listCleanable, listIdeas, deleteEntries };
