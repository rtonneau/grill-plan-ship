// scripts/lib/staleness.js
//
// How long a session has been idle. Last activity is the newest event of the
// session's history (older sessions get the backfilled view), falling back
// to finished_at, created_at, then the session directory's mtime.

const fs = require('fs');
const path = require('path');
const { getHistory } = require('./history');

const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_DAYS = 14;
const VERY_STALE_DAYS = 28;

function toTime(iso) {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

// ISO timestamp of the last activity, or null when nothing readable is left.
function lastActivityAt(sessionDir, config) {
  const candidates = [];
  if (config) {
    let history = [];
    try {
      history = getHistory(config);
    } catch (_err) {
      history = [];
    }
    for (const e of history) candidates.push(e && e.at);
    candidates.push(config.finished_at, config.created_at);
  }
  const times = candidates.map(toTime).filter((t) => t !== null);
  if (times.length > 0) return new Date(Math.max(...times)).toISOString();
  try {
    return fs.statSync(sessionDir).mtime.toISOString();
  } catch (_err) {
    return null;
  }
}

// null | 'stale' (14+ idle days) | 'very-stale' (28+ idle days)
function stalenessOf(idleDays) {
  if (idleDays === null) return null;
  if (idleDays >= VERY_STALE_DAYS) return 'very-stale';
  if (idleDays >= STALE_DAYS) return 'stale';
  return null;
}

function computeIdleness(sessionsDir, sessionId, config, now = new Date()) {
  const at = lastActivityAt(path.join(sessionsDir, sessionId), config);
  const time = at ? toTime(at) : null;
  const idleDays = time === null ? null : Math.max(0, Math.floor((now.getTime() - time) / DAY_MS));
  return { lastActivityAt: at, idleDays, staleness: stalenessOf(idleDays) };
}

module.exports = { STALE_DAYS, VERY_STALE_DAYS, lastActivityAt, stalenessOf, computeIdleness };
