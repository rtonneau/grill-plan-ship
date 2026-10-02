// scripts/lib/phase.js
//
// The session's phase is derived from its files (resume/plan placeholders,
// ticket commit logs) — never from fields stored in .session-config.json.
// The only stored fact used here is finished_at (written by /gps finish;
// legacy sessions may instead have status "completed").

const { resolveWriteTarget } = require('./write-target');
const { listTickets } = require('./ticket-queue');

function isFinishedConfig(config) {
  return Boolean(config && (config.finished_at || config.status === 'completed'));
}

// Phase labels: grill | plan-not-started | plan | ship | finish-pending |
// plan-complete (plan written with zero tickets) | finished.
function derivePhaseLabel(writeTarget, ticketQueue, config) {
  if (isFinishedConfig(config)) return 'finished';
  if (writeTarget.target === 'grill') return 'grill';
  if (writeTarget.target === 'plan') return 'plan';
  if (writeTarget.reason === 'plan-not-started') return 'plan-not-started';
  // writeTarget.target === 'none' && writeTarget.reason === 'complete' from here on.
  if (ticketQueue.nextPending) return 'ship';
  if (ticketQueue.tickets.length > 0) return 'finish-pending';
  return 'plan-complete';
}

function suggestNext(phase, ticketQueue) {
  switch (phase) {
    case 'grill':
      return { command: '/gps write', why: 'Save the approved brainstorm to 01-grill/resume.md.' };
    case 'plan-not-started':
      return {
        command: '/gps plan',
        why: 'The resume is saved; break the work into tickets. For bounded work (no plan), implement it and run /gps finish instead.',
      };
    case 'plan':
      return { command: '/gps write', why: 'Save the approved plan and tickets to 02-plan/.' };
    case 'ship': {
      const next = ticketQueue && ticketQueue.nextPending;
      return {
        command: '/gps ship',
        why: next
          ? `Ticket ${next.num} (${next.slug}) is next. Use /gps ticket ${Number(next.num)} to work on it alone.`
          : 'Tickets are pending.',
      };
    }
    case 'finish-pending':
    case 'plan-complete':
      return { command: '/gps finish', why: 'All work is done; close the session and write its summary.' };
    case 'finished':
      return { command: '/gps start <feature-name>', why: 'This session is finished.' };
    default:
      return { command: '/gps status', why: 'Unknown phase.' };
  }
}

// Everything status/handoff/resume need about where a session stands.
function computeSessionState(sessionDir, config) {
  const writeTarget = resolveWriteTarget(sessionDir);
  const ticketQueue = listTickets(sessionDir);
  const phase = derivePhaseLabel(writeTarget, ticketQueue, config);
  return { writeTarget, ticketQueue, phase, suggestedNext: suggestNext(phase, ticketQueue) };
}

module.exports = { isFinishedConfig, derivePhaseLabel, suggestNext, computeSessionState };
