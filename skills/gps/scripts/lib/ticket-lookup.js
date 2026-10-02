// skills/gps/scripts/lib/ticket-lookup.js
//
// Finds tickets for the ticket-*.js scripts, after checking the plan is
// written. Lives apart from ticket-queue.js because lib/write-target.js
// requires that module.

const fs = require('fs');
const path = require('path');
const { listTickets } = require('./ticket-queue');
const { resolveWriteTarget } = require('./write-target');
const { GpsError } = require('./guard');

// The ticket queue (listTickets) once the plan is written; throws a
// GpsError with the command to run otherwise. Badly named files are warned
// about on stderr.
function readyTickets(sessionDir) {
  const writeTarget = resolveWriteTarget(sessionDir).target;
  if (writeTarget === 'grill') {
    throw new GpsError('The grill phase is not written yet.', 'Run /gps write, then /gps plan.');
  }
  if (writeTarget === 'plan') {
    throw new GpsError('The plan and tickets are not written yet.', 'Run /gps write to save them, then /gps ship.');
  }
  if (!fs.existsSync(path.join(sessionDir, '02-plan', 'tickets'))) {
    throw new GpsError('This session has no tickets yet.', 'Run /gps plan, then /gps ship.');
  }
  const queue = listTickets(sessionDir);
  for (const fileName of queue.skipped) {
    console.error(`⚠️  Skipped ${fileName}: ticket files must be named NN-<slug>.md`);
  }
  if (queue.tickets.length === 0) throw new GpsError('No tickets found.', 'Run /gps plan, then /gps ship.');
  return queue;
}

// Every valid ticket with this number (duplicates are all kept), in filename
// order. Throws a GpsError when the plan is not written or none matches.
function findTicketsByNumber(sessionDir, ticketNum) {
  const candidates = readyTickets(sessionDir).tickets.filter((t) => Number(t.num) === ticketNum);
  if (candidates.length === 0) {
    throw new GpsError(`Ticket ${ticketNum} not found.`, 'Run ticket-queue.js (or /gps status) to list the tickets.');
  }
  return candidates;
}

// The first not-yet-done ticket with this number, else the first.
function findTicketByNumber(sessionDir, ticketNum) {
  const candidates = findTicketsByNumber(sessionDir, ticketNum);
  return candidates.find((t) => !t.done) || candidates[0];
}

module.exports = { readyTickets, findTicketsByNumber, findTicketByNumber };
