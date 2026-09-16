#!/usr/bin/env node

/**
 * /gps ticket <number>
 *
 * Reads ticket spec, creates implementation directory, prints spec
 */

const fs = require('fs');
const path = require('path');
const { loadTemplate, renderTemplate } = require('./lib/templates');
const { getCurrentSessionId } = require('./lib/session-store');

function getTicket(ticketNum) {
  const projectRoot = process.cwd();
  const sessionsDir = path.join(projectRoot, '.work', 'sessions');
  const currentSession = getCurrentSessionId(sessionsDir);

  if (!currentSession) {
    console.error('No sessions found. Run /gps start first.');
    process.exit(1);
  }

  const ticketsDir = path.join(sessionsDir, currentSession, '02-plan', 'tickets');

  const ticketFiles = fs.readdirSync(ticketsDir)
    .filter((f) => f.startsWith(ticketNum.toString().padStart(2, '0') + '-'))
    .sort();

  if (ticketFiles.length === 0) {
    console.error(`Ticket ${ticketNum} not found.`);
    process.exit(1);
  }

  const ticketPath = path.join(ticketsDir, ticketFiles[0]);
  const ticketContent = fs.readFileSync(ticketPath, 'utf-8');
  const slug = ticketFiles[0].replace(/^\d+-/, '').replace(/\.md$/, '');

  return { ticketContent, slug, currentSession };
}

function implementTicket(ticketNum) {
  const projectRoot = process.cwd();
  const { ticketContent, slug, currentSession } = getTicket(ticketNum);

  const sessionDir = path.join(projectRoot, '.work', 'sessions', currentSession);
  const ticketNumPadded = ticketNum.toString().padStart(2, '0');
  const implDir = path.join(sessionDir, '03-implement', `${ticketNumPadded}-${slug}`);

  fs.mkdirSync(implDir, { recursive: true });

  const logContent = renderTemplate(loadTemplate('03-implement-log.md'), {
    N: ticketNumPadded,
  });
  fs.writeFileSync(path.join(implDir, 'commit-log.md'), logContent);

  console.log('\n' + '='.repeat(70));
  console.log(`TICKET SPEC - ${ticketNumPadded}`);
  console.log('='.repeat(70) + '\n');
  console.log(ticketContent);
  console.log('\n' + '='.repeat(70));
  console.log(`Working directory: ${implDir}`);
  console.log(`Log file: ${path.join(implDir, 'commit-log.md')}`);
  console.log('\nImplement in Claude Code, test locally, save results to commit-log.md');
  console.log('='.repeat(70) + '\n');
}

const ticketNum = process.argv[2];
if (!ticketNum) {
  console.error('Usage: /gps ticket <number>');
  process.exit(1);
}

implementTicket(ticketNum);
