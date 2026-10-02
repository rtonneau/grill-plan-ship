#!/usr/bin/env node

/**
 * ticket-check.js <number> [--json]
 *
 * /gps ship: verifies that a ticket really is complete — what to run after
 * a subagent reports DONE. Exits 0 only when its commit log says
 * "✅ Done", a `ticket_done` event is recorded, and every commit the log
 * lists exists in git; otherwise exits 1 naming what is missing. Read-only.
 */

const fs = require('fs');
const { main } = require('./lib/cli');
const { resolveSession } = require('./lib/session-store');
const { findTicketsByNumber } = require('./lib/ticket-lookup');
const { recordedCommits } = require('./lib/commit-log');
const { commitExists } = require('./lib/git');
const { hasEvent } = require('./lib/history');
const { GpsError, UsageError } = require('./lib/guard');

main({
  usage: 'ticket-check.js <number> [--json]',
  positionals: { min: 1, max: 1 },
  run({ positionals: [arg], projectRoot }) {
    if (!/^\d+$/.test(arg)) throw new UsageError(`Invalid ticket number: ${arg}`);
    const { sessionDir, config } = resolveSession(projectRoot);
    const candidates = findTicketsByNumber(sessionDir, Number(arg));
    // With duplicate numbers, the one a run would work on: first not Done.
    const ticket = candidates.find((t) => !t.done) || candidates[candidates.length - 1];
    const key = `${ticket.num}-${ticket.slug}`;

    const problems = [];
    if (!ticket.done) problems.push('its commit log does not say "**Status:** ✅ Done"');
    if (!hasEvent(config, 'ticket_done', { ticket: key })) problems.push('no ticket_done event is recorded (ticket-complete.js never ran)');
    const commits = fs.existsSync(ticket.commitLogPath) ? recordedCommits(fs.readFileSync(ticket.commitLogPath, 'utf-8')) : [];
    if (commits.length === 0) problems.push('its commit log lists no commit');
    const unknown = commits.filter((sha) => !commitExists(projectRoot, sha));
    if (unknown.length > 0) problems.push(`commit(s) ${unknown.join(', ')} not found in git`);

    if (problems.length > 0) {
      throw new GpsError(`Ticket ${ticket.num} (${ticket.slug}) is not complete: ${problems.join('; ')}.`,
        'A DONE report was inaccurate: stop the ship run and report it to the user.');
    }
    return {
      text: `✅ Ticket ${ticket.num} (${ticket.slug}) is complete: ${commits.join(', ')}.`,
      data: { ticket: key, complete: true, commits },
    };
  },
});
