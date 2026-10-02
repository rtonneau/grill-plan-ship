#!/usr/bin/env node

/**
 * ticket-block.js <number> --reason <text> [--json]
 *
 * /gps ship: records that a ticket can't be finished (its Verification
 * Step won't pass, or it needs something only the user can provide): the
 * reason goes into the commit log's "Blockers / Challenges" section, the
 * Status stays In Progress, and a `ticket_blocked` event is recorded.
 * Commits nothing. The ship run stops at a blocked ticket.
 */

const fs = require('fs');
const { main } = require('./lib/cli');
const { resolveSession } = require('./lib/session-store');
const { findTicketByNumber } = require('./lib/ticket-lookup');
const { blockLog } = require('./lib/commit-log');
const { recordEvent, sessionPath } = require('./lib/history');
const { GpsError, UsageError } = require('./lib/guard');

main({
  usage: 'ticket-block.js <number> --reason <text> [--json]',
  positionals: { min: 1, max: 1 },
  options: { reason: 'string' },
  run({ positionals: [arg], options, projectRoot }) {
    if (!/^\d+$/.test(arg)) throw new UsageError(`Invalid ticket number: ${arg}`);
    if (!options.reason || !options.reason.trim()) throw new UsageError('Give --reason with one line saying what blocks the ticket.');

    const { sessionDir, configPath, config } = resolveSession(projectRoot);
    const ticket = findTicketByNumber(sessionDir, Number(arg));
    if (ticket.done) throw new GpsError(`Ticket ${ticket.num} (${ticket.slug}) is already Done.`, 'A Done ticket is never reset.');
    if (!fs.existsSync(ticket.commitLogPath)) {
      throw new GpsError(`Ticket ${ticket.num} (${ticket.slug}) was never started.`, `Run ticket-start.js ${Number(ticket.num)} first.`);
    }

    const at = new Date().toISOString();
    const reason = options.reason.trim().replace(/\s*\r?\n\s*/g, ' ');
    fs.writeFileSync(ticket.commitLogPath, blockLog(fs.readFileSync(ticket.commitLogPath, 'utf-8'), reason, at));
    const key = `${ticket.num}-${ticket.slug}`;
    recordEvent(configPath, config, sessionDir, {
      event: 'ticket_blocked',
      files: [sessionPath(sessionDir, ticket.commitLogPath)],
      detail: { ticket: key, reason },
      at,
    });

    return {
      text: `⛔ Ticket ${ticket.num} (${ticket.slug}) blocked: ${reason}\n`
        + 'Recorded in its commit log; nothing was committed. Stop the ship run and report this to the user.',
      data: { ticket: key, reason, commitLogPath: ticket.commitLogPath },
    };
  },
});
