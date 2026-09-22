// scripts/lib/handoff.js
const path = require('path');
const { readRecentCommits, readGitStatus } = require('./git');
const { derivePhaseLabel, computeSessionState } = require('./phase');
const { readJson } = require('./guard');

function buildHandoffData(sessionDir, projectRoot) {
  const config = readJson(path.join(sessionDir, '.session-config.json'), '.session-config.json');
  const { ticketQueue, phase: currentPhase, suggestedNext } = computeSessionState(sessionDir, config);
  const activeTicket = ticketQueue.nextPending
    ? `${ticketQueue.nextPending.num}-${ticketQueue.nextPending.slug}`
    : null;
  const ticketQueueSummary = ticketQueue.tickets.map(
    (t) => `${t.num}-${t.slug}: ${t.done ? 'done' : 'pending'}`
  );

  return {
    sessionId: config.session_id,
    featureName: config.feature_name,
    currentPhase,
    suggestedNext,
    activeTicket,
    ticketQueueSummary,
    gitLog: readRecentCommits(projectRoot, config.created_at),
    gitStatus: readGitStatus(projectRoot, sessionDir),
    timestamp: new Date().toISOString(),
  };
}

module.exports = { buildHandoffData, derivePhaseLabel };
