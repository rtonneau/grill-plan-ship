#!/usr/bin/env node

/**
 * ticket-start.js [<number>] [--json]
 *
 * /gps ship: prepares one ticket for implementation (the next pending one
 * when no number is given): creates 03-implement/NN-<slug>/ and its
 * commit-log.md, records the ticket's token-usage phase and a
 * `ticket_started` event (once), and prints the spec, the log and the
 * scratch dir. When every ticket is done it says so and points at
 * /gps finish.
 *
 * - Refuses until the plan phase is written.
 * - An existing commit-log.md is never overwritten: a Done ticket is
 *   reported and left alone; an unfinished one resumes from its log.
 * - Several files with the same number are all valid tickets; the first
 *   not-yet-done one (filename order) is picked.
 */

const fs = require('fs');
const { main } = require('./lib/cli');
const { loadTemplate, renderTemplate } = require('./lib/templates');
const { resolveSession } = require('./lib/session-store');
const { isTicketDone } = require('./lib/ticket-queue');
const { findTicketByNumber, readyTickets } = require('./lib/ticket-lookup');
const { touchPhase } = require('./lib/token-usage');
const { hasEvent, recordEvent, sessionPath } = require('./lib/history');
const { ensureScratchDir } = require('./lib/scratch-dir');
const { UsageError, writeJsonAtomic } = require('./lib/guard');

const RULE = '='.repeat(70);

// The ticket to start: the numbered one, else the first pending one (null
// when all are done). Lookup errors (plan not written, ...) are thrown.
function pickTicket(sessionDir, arg) {
  if (arg !== undefined) {
    if (!/^\d+$/.test(arg)) throw new UsageError(`Invalid ticket number: ${arg}`);
    return findTicketByNumber(sessionDir, Number(arg));
  }
  return readyTickets(sessionDir).nextPending;
}

main({
  usage: 'ticket-start.js [<number>] [--json]',
  positionals: { min: 0, max: 1 },
  run({ positionals: [arg], projectRoot, warn }) {
    const { sessionId, sessionDir, configPath, config } = resolveSession(projectRoot);
    const ticket = pickTicket(sessionDir, arg);
    if (!ticket) {
      return { text: 'All tickets are done. Next: /gps finish', data: { sessionId, ticket: null, allDone: true } };
    }

    const key = `${ticket.num}-${ticket.slug}`;
    if (isTicketDone(ticket.commitLogPath)) {
      return {
        text: `✅ Ticket ${ticket.num} (${ticket.slug}) is already Done; nothing was changed.\nLog file: ${ticket.commitLogPath}`,
        data: { sessionId, ticket, alreadyDone: true },
      };
    }

    fs.mkdirSync(ticket.implDir, { recursive: true });
    const phaseKey = `03-${key}`;
    const alreadyStarted = hasEvent(config, 'ticket_started', { ticket: key });
    touchPhase(config, phaseKey);
    if (!config.scratch_dir) warn(`${sessionId} predates scratch dirs; adding scratch_dir to its config.`);
    const scratchDir = ensureScratchDir(projectRoot, sessionId);
    config.scratch_dir = scratchDir;
    writeJsonAtomic(configPath, config);

    const logExisted = fs.existsSync(ticket.commitLogPath);
    if (!logExisted) {
      fs.writeFileSync(ticket.commitLogPath, renderTemplate(loadTemplate('03-implement-log.md'), { N: ticket.num, slug: ticket.slug }));
    }
    if (!alreadyStarted) {
      recordEvent(configPath, config, sessionDir, {
        event: 'ticket_started',
        files: [sessionPath(sessionDir, ticket.ticketPath), sessionPath(sessionDir, ticket.commitLogPath)],
        detail: { ticket: key },
      });
    }

    const spec = fs.readFileSync(ticket.ticketPath, 'utf-8');
    const text = [
      RULE, `TICKET ${ticket.num}: ${ticket.slug} (model hint: ${ticket.model})`, RULE, '', spec.trimEnd(), '', RULE,
      `Spec: ${ticket.ticketPath}`,
      `Log file: ${ticket.commitLogPath}${logExisted ? '  (existing log kept — resume from it)' : ''}`,
      `Scratch dir: ${scratchDir}  (all build/run/test output goes here; prefix files with ${ticket.num}-)`,
      `Token usage phase key: ${phaseKey}`,
      RULE,
      `Next: implement it, run its Verification Step, fill the log's Local Test Result, Review Notes and Blockers sections, `
        + `then ticket-complete.js ${Number(ticket.num)} --message "<commit message>" --file <path>... (or ticket-block.js ${Number(ticket.num)} --reason "<why>").`,
    ].join('\n');

    return {
      text,
      data: { sessionId, ticket, phaseKey, scratchDir, logExisted, spec },
    };
  },
});
