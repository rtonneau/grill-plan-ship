#!/usr/bin/env node

/**
 * ticket-done.js <number>
 *
 * Called right after a ticket's commit-log.md Status line is set to
 * "✅ Done": records a `ticket_done` event (exact time + the log's path) in
 * the session history. Refuses, changing nothing, unless the log really says
 * Done. Idempotent: a ticket already recorded is left alone. With several
 * tickets sharing a number it records the first one that is Done and not
 * yet recorded.
 */

const { resolveSession } = require('./lib/session-store');
const { findTicketsByNumber } = require('./lib/ticket-lookup');
const { hasEvent, recordEvent, sessionPath } = require('./lib/history');
const { GpsError, runCli } = require('./lib/guard');

runCli(() => {
  const arg = process.argv[2];
  if (!arg || !/^\d+$/.test(arg)) {
    throw new GpsError('Missing or invalid ticket number.', 'Usage: ticket-done.js <number>  (e.g. ticket-done.js 3)');
  }

  const { sessionDir, configPath, config } = resolveSession(process.cwd());
  const candidates = findTicketsByNumber(sessionDir, Number(arg));
  const keyOf = (t) => `${t.num}-${t.slug}`;
  const recorded = (t) => hasEvent(config, 'ticket_done', { ticket: keyOf(t) });

  const ticket = candidates.find((t) => t.done && !recorded(t)) || candidates.find((t) => t.done);
  if (!ticket) {
    const first = candidates[0];
    throw new GpsError(
      `Ticket ${first.num} (${first.slug}) is not marked Done in its commit-log.md; nothing was recorded.`,
      `Set its Status line to exactly "**Status:** ✅ Done" in ${first.commitLogPath}, then run this again.`
    );
  }

  if (recorded(ticket)) {
    console.log(`✅ Ticket ${ticket.num} (${ticket.slug}) was already recorded as Done; nothing was changed.`);
    return;
  }

  recordEvent(configPath, config, sessionDir, {
    event: 'ticket_done',
    files: [sessionPath(sessionDir, ticket.commitLogPath)],
    detail: { ticket: keyOf(ticket) },
  });
  console.log(`✅ Ticket ${ticket.num} (${ticket.slug}) recorded as Done.`);
});
