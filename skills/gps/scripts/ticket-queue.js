#!/usr/bin/env node

/**
 * ticket-queue.js [--json]
 *
 * /gps ship: lists the current session's tickets in execution order with
 * their state and model and effort hints, and names the next pending one. A
 * ticket is Done only when its commit-log.md Status line is exactly
 * "**Status:** ✅ Done". Unknown **Model:** or **Effort:** values (hand
 * edits) are warned about and count as inherit. Also prints the ship mode used last in this
 * session (config.ship_mode, set by ticket-start.js --mode), if any. Read-only.
 */

const { main } = require('./lib/cli');
const { TICKET_MODELS, TICKET_EFFORTS } = require('./lib/ticket-queue');
const { MAX_EFFORT_REASON } = require('./lib/ticket-model');
const { readyTickets } = require('./lib/ticket-lookup');
const { resolveSession } = require('./lib/session-store');

main({
  usage: 'ticket-queue.js [--json]',
  run({ projectRoot, warn }) {
    const { sessionId, sessionDir, config } = resolveSession(projectRoot);
    const shipMode = config.ship_mode || null;
    const { tickets, nextPending } = readyTickets(sessionDir);
    for (const { num, slug, modelInvalid, effortInvalid } of tickets) {
      if (modelInvalid !== null) {
        warn(`Ticket ${num}-${slug}: unknown model "${modelInvalid}", using inherit (use ${TICKET_MODELS.join(', ')})`);
      }
      if (effortInvalid !== null) {
        const why = effortInvalid.toLowerCase() === 'max' ? ` (${MAX_EFFORT_REASON})` : '';
        warn(`Ticket ${num}-${slug}: unknown effort "${effortInvalid}", using inherit${why} (use ${TICKET_EFFORTS.join(', ')})`);
      }
    }

    const pending = tickets.filter((t) => !t.done);
    const lines = [
      `Tickets of ${sessionId}: ${tickets.length - pending.length}/${tickets.length} done.`,
      ...(shipMode ? [`Last ship mode: ${shipMode}`] : []),
      '',
      ...tickets.map((t) => `- ${t.num} ${t.slug} — ${t.done ? 'done' : 'pending'} — model ${t.model}, effort ${t.effort}`),
      '',
    ];
    if (nextPending) {
      lines.push(`Next pending: ${nextPending.num} ${nextPending.slug}`, '', 'Model and effort hints of the remaining tickets:',
        ...pending.map((t) => `${Number(t.num)}: ${t.model}/${t.effort}`));
    } else {
      lines.push('All tickets are done. Next: /gps finish');
    }
    return { text: lines.join('\n'), data: { sessionId, sessionDir, tickets, nextPending, shipMode } };
  },
});
