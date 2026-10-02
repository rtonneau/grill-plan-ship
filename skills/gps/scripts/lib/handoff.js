// skills/gps/scripts/lib/handoff.js
//
// The session's in-flight checkpoint, HANDOFF.md. /gps handoff writes it
// from live state (buildHandoffData) plus narrative Claude fills in;
// /gps status reads it back (readHandoff) and reports drift between what it
// recorded and what is true now.

const fs = require('fs');
const path = require('path');
const { readRecentCommits, readGitStatus } = require('./git');
const { computeSessionState } = require('./phase');
const { readJson, toLines } = require('./guard');

const HANDOFF_FILENAME = 'HANDOFF.md';

function buildHandoffData(sessionDir, projectRoot) {
  const config = readJson(path.join(sessionDir, '.session-config.json'), '.session-config.json');
  const { ticketQueue, phase: currentPhase, suggestedNext } = computeSessionState(sessionDir, config);
  const activeTicket = ticketQueue.nextPending
    ? `${ticketQueue.nextPending.num}-${ticketQueue.nextPending.slug}`
    : null;

  return {
    sessionId: config.session_id,
    featureName: config.feature_name,
    currentPhase,
    suggestedNext,
    activeTicket,
    ticketQueueSummary: ticketQueue.tickets.map((t) => `${t.num}-${t.slug}: ${t.done ? 'done' : 'pending'}`),
    gitLog: readRecentCommits(projectRoot, config.created_at),
    gitStatus: readGitStatus(projectRoot, sessionDir),
    timestamp: new Date().toISOString(),
  };
}

// "**Label:** value" lines before the first heading go to meta; every
// "## Heading" block goes to sections (trimmed).
function parseHandoffMarkdown(content) {
  const meta = {};
  const sections = {};
  let currentHeading = null;
  let buffer = [];

  for (const line of toLines(content)) {
    const headingMatch = line.match(/^## (.+)$/);
    if (headingMatch) {
      if (currentHeading) sections[currentHeading] = buffer.join('\n').trim();
      currentHeading = headingMatch[1].trim();
      buffer = [];
    } else if (currentHeading) {
      buffer.push(line);
    } else {
      const metaMatch = line.match(/^\*\*(.+?):\*\*\s*(.*)$/);
      if (metaMatch) meta[metaMatch[1].trim()] = metaMatch[2].trim();
    }
  }
  if (currentHeading) sections[currentHeading] = buffer.join('\n').trim();

  return { meta, sections };
}

// One sentence per fact the handoff recorded that is no longer true, or null.
function describeDrift(meta, live) {
  const drifts = [];
  if (meta['Current phase'] && meta['Current phase'] !== live.phase) {
    drifts.push(`handoff said current phase was "${meta['Current phase']}"; it is now "${live.phase}"`);
  }
  const liveActiveTicket = live.activeTicket || 'none';
  if (meta['Active ticket'] && meta['Active ticket'] !== liveActiveTicket) {
    drifts.push(`handoff said active ticket was "${meta['Active ticket']}"; it is now "${liveActiveTicket}"`);
  }
  return drifts.length ? drifts.join('; ') : null;
}

// { meta, sections, drift } of the session's HANDOFF.md, or null without one.
// `live` is { phase, activeTicket } as computed now.
function readHandoff(sessionDir, live) {
  const handoffPath = path.join(sessionDir, HANDOFF_FILENAME);
  if (!fs.existsSync(handoffPath)) return null;
  const { meta, sections } = parseHandoffMarkdown(fs.readFileSync(handoffPath, 'utf-8'));
  return { meta, sections, drift: describeDrift(meta, live) };
}

module.exports = { HANDOFF_FILENAME, buildHandoffData, parseHandoffMarkdown, describeDrift, readHandoff };
