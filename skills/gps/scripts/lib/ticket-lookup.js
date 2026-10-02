// scripts/lib/ticket-lookup.js
//
// Finds a ticket by its number for /gps ticket and ticket-done.js. Lives
// apart from ticket-queue.js because write-target.js requires that module.

const fs = require('fs');
const path = require('path');
const { listTickets } = require('./ticket-queue');
const { resolveWriteTarget } = require('./write-target');
const { GpsError } = require('./guard');

// Every valid ticket with this number (duplicates are all kept), in filename
// order. Throws a GpsError when the plan is not written or none matches.
function findTicketsByNumber(sessionDir, ticketNum) {
  const ticketsDir = path.join(sessionDir, '02-plan', 'tickets');
  if (!fs.existsSync(ticketsDir)) {
    throw new GpsError('This session has no tickets yet.', 'Run /gps plan, then /gps write, then /gps ticket <N>.');
  }

  const writeTarget = resolveWriteTarget(sessionDir).target;
  if (writeTarget === 'grill') {
    throw new GpsError('The grill phase is not written yet.', 'Run /gps write, then /gps plan.');
  }
  if (writeTarget === 'plan') {
    throw new GpsError('The plan and tickets are not written yet.', 'Run /gps write to save them, then /gps ticket <N>.');
  }

  const { tickets, skipped } = listTickets(sessionDir);
  for (const fileName of skipped) {
    console.error(`⚠️  Skipped ${fileName}: ticket files must be named NN-<slug>.md`);
  }
  const candidates = tickets.filter((t) => Number(t.num) === ticketNum);

  if (candidates.length === 0) {
    throw new GpsError(`Ticket ${ticketNum} not found.`, 'Run /gps ship or /gps status to list the tickets.');
  }
  return candidates;
}

// The first not-yet-done ticket with this number, else the first.
function findTicketByNumber(sessionDir, ticketNum) {
  const candidates = findTicketsByNumber(sessionDir, ticketNum);
  return candidates.find((t) => !t.done) || candidates[0];
}

module.exports = { findTicketsByNumber, findTicketByNumber };
