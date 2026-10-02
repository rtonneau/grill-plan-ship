#!/usr/bin/env node

/**
 * ticket-queue.js [--json]
 *
 * /gps ship: lists the current session's tickets in execution order with
 * their state and model hint, and names the next pending one. A ticket is
 * Done only when its commit-log.md Status line is exactly
 * "**Status:** ✅ Done". Unknown **Model:** values (hand edits) are warned
 * about and count as inherit. Read-only.
 */

const { main } = require('./lib/cli');
const { TICKET_MODELS } = require('./lib/ticket-queue');
const { readyTickets } = require('./lib/ticket-lookup');
const { resolveSession } = require('./lib/session-store');

main({
  usage: 'ticket-queue.js [--json]',
  run({ projectRoot, warn }) {
    const { sessionId, sessionDir } = resolveSession(projectRoot);
    const { tickets, nextPending } = readyTickets(sessionDir);
    for (const { num, slug, modelInvalid } of tickets) {
      if (modelInvalid !== null) {
        warn(`Ticket ${num}-${slug}: unknown model "${modelInvalid}", using inherit (use ${TICKET_MODELS.join(', ')})`);
      }
    }

    const pending = tickets.filter((t) => !t.done);
    const lines = [
      `Tickets of ${sessionId}: ${tickets.length - pending.length}/${tickets.length} done.`,
      '',
      ...tickets.map((t) => `- ${t.num} ${t.slug} — ${t.done ? 'done' : 'pending'} — model ${t.model}`),
      '',
    ];
    if (nextPending) {
      lines.push(`Next pending: ${nextPending.num} ${nextPending.slug}`, '', 'Model hints of the remaining tickets:',
        ...pending.map((t) => `${Number(t.num)}: ${t.model}`));
    } else {
      lines.push('All tickets are done. Next: /gps finish');
    }
    return { text: lines.join('\n'), data: { sessionId, sessionDir, tickets, nextPending } };
  },
});
