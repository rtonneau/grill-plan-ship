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
 */

const fs = require('fs');
const path = require('path');
const { loadTemplate, renderTemplate } = require('./lib/templates');
const { resolveSession } = require('./lib/session-store');
const { listTickets, isTicketDone } = require('./lib/ticket-queue');
const { resolveWriteTarget } = require('./lib/write-target');
const { touchPhase } = require('./lib/token-usage');
const { ensureScratchDir } = require('./lib/scratch-dir');
const { GpsError, writeJsonAtomic, runCli } = require('./lib/guard');

function findTicket(sessionDir, ticketNum) {
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
  return candidates.find((t) => !t.done) || candidates[0];
}

function implementTicket(ticketNum) {
  const projectRoot = process.cwd();
  const { sessionId, sessionDir, configPath, config } = resolveSession(projectRoot);
  const ticket = findTicket(sessionDir, ticketNum);
  const phaseKey = `03-${ticket.num}-${ticket.slug}`;

  if (isTicketDone(ticket.commitLogPath)) {
    console.log(`✅ Ticket ${ticket.num} (${ticket.slug}) is already Done; nothing was changed.`);
    console.log(`Log file: ${ticket.commitLogPath}`);
    return;
  }

  fs.mkdirSync(ticket.implDir, { recursive: true });

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
