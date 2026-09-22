// scripts/lib/handoff.js
const fs = require('fs');
const path = require('path');
const { resolveWriteTarget } = require('./write-target');
const { listTickets } = require('./ticket-queue');
const { readRecentCommits, readGitStatus } = require('./git');

function derivePhaseLabel(writeTarget, ticketQueue) {
  if (writeTarget.target === 'grill') return 'grill';
  if (writeTarget.target === 'plan') return 'plan';
  if (writeTarget.reason === 'plan-not-started') return 'plan-not-started';
  // writeTarget.target === 'none' && writeTarget.reason === 'complete' from here on.
  if (ticketQueue.nextPending) return 'ship';
  if (ticketQueue.tickets.length > 0) return 'finish-pending';
  return 'plan-complete';
}

function buildHandoffData(sessionDir, projectRoot) {
  const config = JSON.parse(fs.readFileSync(path.join(sessionDir, '.session-config.json'), 'utf-8'));
  const writeTarget = resolveWriteTarget(sessionDir);
  const ticketQueue = listTickets(sessionDir);
  const currentPhase = derivePhaseLabel(writeTarget, ticketQueue);
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
    activeTicket,
    ticketQueueSummary,
    gitLog: readRecentCommits(projectRoot, config.created_at),
    gitStatus: readGitStatus(projectRoot, sessionDir),
    timestamp: new Date().toISOString(),
  };
}

module.exports = { buildHandoffData, derivePhaseLabel };
