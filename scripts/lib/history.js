// scripts/lib/history.js
//
// The session's timeline, stored in .session-config.json:
//   history:       append-only list of events { at, event, phase, files?, detail?, backfilled? }
//   current_phase: the phase after the last recorded event
// Files stay the source of truth for the phase (phase.js derives it); the
// recorded phase is a fact about when handlers last ran, and /gps status
// reports drift between the two. `phase` of an event is derived at record
// time with computeSessionState, so it always uses phase.js's vocabulary.
// Event `files` are relative to the session directory, forward slashes.
//
// recordEvent never throws: history must never block a command.

const path = require('path');
const { localDate, writeJsonAtomic } = require('./guard');
const { computeSessionState } = require('./phase');

const TICKET_USAGE_KEY_RE = /^03-(\d+-.+)$/;

// Path of `absolutePath` relative to the session directory, forward slashes.
function sessionPath(sessionDir, absolutePath) {
  return path.relative(sessionDir, absolutePath).split(path.sep).join('/');
}

// Events reconstructed from the facts older sessions stored: created_at,
// usage.*.startedAt, finished_at. Sorted by time, each flagged backfilled.
function backfillHistory(config) {
  const events = [];
  const add = (at, event, phase, extra = {}) => {
    if (at) events.push({ at, event, phase, ...extra, backfilled: true });
  };
  const usage = config.usage || {};

  add(config.created_at, 'session_started', 'grill', { files: ['01-grill/resume.md'] });
  if (usage.plan) add(usage.plan.startedAt, 'plan_started', 'plan', { files: ['02-plan/plan.md'] });
  for (const [key, value] of Object.entries(usage)) {
    const match = key.match(TICKET_USAGE_KEY_RE);
    if (match && value) {
      add(value.startedAt, 'ticket_started', 'ship', {
        files: [`03-implement/${match[1]}/commit-log.md`],
        detail: { ticket: match[1] },
      });
    }
  }
  add(config.finished_at, 'session_finished', 'finished', { files: ['INDEX.md'] });

  return events.sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

// The stored history, or the backfilled view of a session that has none.
function getHistory(config) {
  return Array.isArray(config.history) ? config.history : backfillHistory(config);
}

// Makes sure config.history is a list, backfilling it when it is missing
// (or, with a warning, when it is not a list). Returns it.
function ensureHistory(config) {
  if (Array.isArray(config.history)) return config.history;
  if (config.history !== undefined) {
    console.error('⚠️  history in .session-config.json is not a list; rebuilt from the stored timestamps.');
  }
  config.history = backfillHistory(config);
  return config.history;
}

function hasEvent(config, event, detail = {}) {
  return getHistory(config).some((e) => e.event === event
    && Object.entries(detail).every(([key, value]) => e.detail && e.detail[key] === value));
}

// Appends one event, sets current_phase to the phase after it and saves the
// config. Returns true when recorded, false (with a warning) on any error.
function recordEvent(configPath, config, sessionDir, { event, files, detail, at } = {}) {
  try {
    const hadHistory = Array.isArray(config.history);
    const history = ensureHistory(config);
    if (!hadHistory) {
      // The command just wrote the fact the backfill read: keep the real event, not its reconstruction.
      for (let i = history.length - 1; i >= 0; i -= 1) {
        const sameTicket = !detail || !detail.ticket || (history[i].detail && history[i].detail.ticket === detail.ticket);
        if (history[i].backfilled && history[i].event === event && sameTicket) history.splice(i, 1);
      }
    }

    const { phase } = computeSessionState(sessionDir, config);
    const entry = { at: at || new Date().toISOString(), event, phase };
    if (files && files.length > 0) entry.files = files;
    if (detail && Object.keys(detail).length > 0) entry.detail = detail;
    history.push(entry);
    config.current_phase = phase;
    writeJsonAtomic(configPath, config);
    return true;
  } catch (err) {
    console.error(`⚠️  Session history not recorded: ${err && err.message ? err.message : err}`);
    return false;
  }
}

// "YYYY-MM-DD HH:MM" in the machine's local time.
function localStamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const pad2 = (n) => String(n).padStart(2, '0');
  return `${localDate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

const cell = (text) => String(text).replace(/\|/g, '\\|');

function detailsCell(entry) {
  const parts = Object.entries(entry.detail || {}).map(([key, value]) => `${key}: ${value}`);
  if (entry.backfilled) parts.push('(reconstructed)');
  return parts.join(', ');
}

// Markdown lines of a "## Timeline" table (ending with an empty line).
function renderTimeline(events) {
  const lines = ['## Timeline', '', '| When | Phase | Event | Details | Files |', '|---|---|---|---|---|'];
  for (const e of events) {
    const files = (e.files || []).map((f) => `[${f}](${f})`).join(', ');
    const cells = [localStamp(e.at), e.phase || '', e.event, detailsCell(e), files].map(cell);
    lines.push(`| ${cells.join(' | ')} |`);
  }
  lines.push('');
  return lines;
}

module.exports = {
  sessionPath,
  backfillHistory,
  getHistory,
  ensureHistory,
  hasEvent,
  recordEvent,
  renderTimeline,
};
