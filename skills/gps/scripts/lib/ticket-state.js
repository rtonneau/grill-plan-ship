// skills/gps/scripts/lib/ticket-state.js
//
// Where each ticket stands: pending, started, blocked or done. The files are
// the truth for done (the commit log reads Done) and started (the log
// exists); the session history adds blocked: a ticket_blocked event with no
// later ticket_resumed, ticket_done or session_finished. Pure: callers pass
// the tickets (from listTickets) and the history (getHistory).

const fs = require('fs');

const TICKET_STATES = ['pending', 'started', 'blocked', 'done'];
const CLOSES_BLOCK = new Set(['ticket_resumed', 'ticket_done']);

const keyOf = (ticket) => `${ticket.num}-${ticket.slug}`;

// The ticket's open block as { reason, at }, or null. History order is the
// order the events were recorded in.
function openBlock(history, key) {
  let block = null;
  for (const e of history || []) {
    if (!e) continue;
    const ticket = e.detail ? e.detail.ticket : undefined;
    if (e.event === 'session_finished') block = null;
    else if (ticket !== key) continue;
    else if (e.event === 'ticket_blocked') block = { reason: e.detail.reason || null, at: e.at || null };
    else if (CLOSES_BLOCK.has(e.event)) block = null;
  }
  return block;
}

function ticketState(ticket, history) {
  if (ticket.done) return { state: 'done', blocker: null };
  const key = keyOf(ticket);
  const blocker = openBlock(history, key);
  if (blocker) return { state: 'blocked', blocker };
  const started = fs.existsSync(ticket.commitLogPath)
    || (history || []).some((e) => e && e.event === 'ticket_started' && e.detail && e.detail.ticket === key);
  return { state: started ? 'started' : 'pending', blocker: null };
}

// The tickets with `state` and `blocker` added.
function withTicketStates(tickets, history) {
  return tickets.map((ticket) => ({ ...ticket, ...ticketState(ticket, history) }));
}

module.exports = { TICKET_STATES, openBlock, ticketState, withTicketStates };
