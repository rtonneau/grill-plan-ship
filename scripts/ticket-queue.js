#!/usr/bin/env node

/**
 * /gps ship
 *
 * Prints the current session's ticket queue (which tickets are done,
 * which is next) so Claude Code knows which ticket to implement next.
 * Does not implement anything itself.
 */

const { listTickets } = require('./lib/ticket-queue');
const { resolveSession } = require('./lib/session-store');
const { resolveWriteTarget } = require('./lib/write-target');
const { GpsError, runCli } = require('./lib/guard');

runCli(() => {
  const { sessionId, sessionDir } = resolveSession(process.cwd());

  const writeTarget = resolveWriteTarget(sessionDir).target;
  if (writeTarget === 'grill' || writeTarget === 'plan') {
    throw new GpsError(`The ${writeTarget} phase is not written yet.`, 'Run /gps write first, then /gps ship.');
  }

  const { tickets, nextPending, skipped } = listTickets(sessionDir);
  for (const fileName of skipped) {
    console.error(`⚠️  Skipped ${fileName}: ticket files must be named NN-<slug>.md`);
  }
  if (tickets.length === 0) {
    throw new GpsError('No tickets found.', 'Run /gps plan, then /gps write, then /gps ship.');
  }

  console.log(JSON.stringify({ sessionId, sessionDir, tickets, nextPending }, null, 2));
});
