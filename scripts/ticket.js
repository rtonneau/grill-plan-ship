#!/usr/bin/env node

/**
 * /gps ticket <number>
 *
 * Reads ticket spec, creates implementation directory, prints spec.
 *
 * - Refuses to run until the plan phase is written (no stub tickets).
 * - An existing commit-log.md is never overwritten: a Done ticket is
 *   reported and left alone; an unfinished one keeps its log and the spec
 *   is printed again.
 * - Several files with the same number are all valid tickets; the first
 *   not-yet-done one (alphabetical filename order) is picked.
 * - Records a `ticket_started` event in the session history, once per ticket.
 */

const fs = require('fs');
const { loadTemplate, renderTemplate } = require('./lib/templates');
const { resolveSession } = require('./lib/session-store');
const { isTicketDone } = require('./lib/ticket-queue');
const { findTicketByNumber } = require('./lib/ticket-lookup');
const { touchPhase } = require('./lib/token-usage');
const { hasEvent, recordEvent, sessionPath } = require('./lib/history');
const { ensureScratchDir } = require('./lib/scratch-dir');
const { GpsError, writeJsonAtomic, runCli } = require('./lib/guard');

function implementTicket(ticketNum) {
  const projectRoot = process.cwd();
  const { sessionId, sessionDir, configPath, config } = resolveSession(projectRoot);
  const ticket = findTicketByNumber(sessionDir, ticketNum);
  const phaseKey = `03-${ticket.num}-${ticket.slug}`;
  const ticketKey = `${ticket.num}-${ticket.slug}`;

  if (isTicketDone(ticket.commitLogPath)) {
    console.log(`✅ Ticket ${ticket.num} (${ticket.slug}) is already Done; nothing was changed.`);
    console.log(`Log file: ${ticket.commitLogPath}`);
    return;
  }

  fs.mkdirSync(ticket.implDir, { recursive: true });

  const alreadyStarted = hasEvent(config, 'ticket_started', { ticket: ticketKey });
  touchPhase(config, phaseKey);
  if (!config.scratch_dir) {
    console.error(`⚠️  ${sessionId} predates scratch dirs; adding scratch_dir to its config.`);
  }
  const scratchDir = ensureScratchDir(projectRoot, sessionId);
  config.scratch_dir = scratchDir;
  writeJsonAtomic(configPath, config);

  const logExisted = fs.existsSync(ticket.commitLogPath);
  if (!logExisted) {
    const logContent = renderTemplate(loadTemplate('03-implement-log.md'), { N: ticket.num });
    fs.writeFileSync(ticket.commitLogPath, logContent);
  }

  if (!alreadyStarted) {
    recordEvent(configPath, config, sessionDir, {
      event: 'ticket_started',
      files: [sessionPath(sessionDir, ticket.ticketPath), sessionPath(sessionDir, ticket.commitLogPath)],
      detail: { ticket: ticketKey },
    });
  }

  const ticketContent = fs.readFileSync(ticket.ticketPath, 'utf-8');
  console.log('\n' + '='.repeat(70));
  console.log(`TICKET SPEC - ${ticket.num}`);
  console.log('='.repeat(70) + '\n');
  console.log(ticketContent);
  console.log('\n' + '='.repeat(70));
  console.log(`Working directory: ${ticket.implDir}`);
  console.log(`Scratch dir: ${scratchDir}  (all build/run/test output goes here; prefix files with ${ticket.num}-)`);
  console.log(`Log file: ${ticket.commitLogPath}${logExisted ? '  (existing log kept — resume from it)' : ''}`);
  console.log(`Token usage phase key: ${phaseKey}`);
  console.log('\nImplement in Claude Code, test locally, save results to commit-log.md');
  console.log('='.repeat(70) + '\n');
}

runCli(() => {
  const arg = process.argv[2];
  if (!arg || !/^\d+$/.test(arg)) {
    throw new GpsError('Missing or invalid ticket number.', 'Usage: /gps ticket <number>  (e.g. /gps ticket 3)');
  }
  implementTicket(Number(arg));
});
