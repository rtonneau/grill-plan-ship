#!/usr/bin/env node

/**
 * /gps ship
 *
 * Prints the current session's ticket queue (which tickets are done,
 * which is next) so Claude Code knows which ticket to implement next.
 * Does not implement anything itself.
 */

const fs = require('fs');
const path = require('path');
const { listTickets } = require('./lib/ticket-queue');
const { getCurrentSessionId } = require('./lib/session-store');

function main() {
  const projectRoot = process.cwd();
  const sessionsDir = path.join(projectRoot, '.work', 'sessions');

  if (!fs.existsSync(sessionsDir)) {
    console.error('No sessions found. Run /gps start first.');
    process.exit(1);
  }

  const currentSession = getCurrentSessionId(sessionsDir);
  if (!currentSession) {
    console.error('No sessions found. Run /gps start first.');
    process.exit(1);
  }

  const sessionDir = path.join(sessionsDir, currentSession);
  const { tickets, nextPending } = listTickets(sessionDir);

  if (tickets.length === 0) {
    console.error('No tickets found. Run /gps plan, then /gps write, then /gps ship.');
    process.exit(1);
  }

  console.log(JSON.stringify({ sessionId: currentSession, sessionDir, tickets, nextPending }, null, 2));
}

main();
