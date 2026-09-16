#!/usr/bin/env node

/**
 * /gps ticket <number>
 *
 * Reads ticket spec, creates implementation directory, prints spec
 */

const fs = require('fs');
const path = require('path');

function getTicket(ticketNum) {
  const projectRoot = process.cwd();
  const sessionsDir = path.join(projectRoot, '.work', 'sessions');

  const sessions = fs.readdirSync(sessionsDir).sort().reverse();
  const currentSession = sessions[0];
  const ticketsDir = path.join(sessionsDir, currentSession, '02-plan', 'tickets');

  const ticketFiles = fs.readdirSync(ticketsDir)
    .filter(f => f.startsWith(ticketNum.toString().padStart(2, '0') + '-'))
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

  const sessionsDir = path.join(projectRoot, '.work', 'sessions', currentSession);
  const implDir = path.join(
    sessionsDir,
    '03-implement',
    `${ticketNum.toString().padStart(2, '0')}-${slug}`
  );

  // Create implementation directory
  fs.mkdirSync(implDir, { recursive: true });

  // Create log file
  const logTemplate = `# Ticket ${ticketNum.toString().padStart(2, '0')} Implementation

**Status:** In Progress

## Commits

(To be filled)

## Test Results

(To be filled)
`;

  fs.writeFileSync(path.join(implDir, 'commit-log.md'), logTemplate);

  // Print spec
  console.log('\n' + '='.repeat(70));
  console.log(`TICKET SPEC - ${ticketNum.toString().padStart(2, '0')}`);
  console.log('='.repeat(70) + '\n');
  console.log(ticketContent);
  console.log('\n' + '='.repeat(70));
  console.log(`📝 Working directory: ${implDir}`);
  console.log(`📄 Log file: ${path.join(implDir, 'commit-log.md')}`);
  console.log('\nImplement in Claude Code, test locally, save results to commit-log.md');
  console.log('='.repeat(70) + '\n');
}

const ticketNum = process.argv[2];
if (!ticketNum) {
  console.error('Usage: /gps ticket <number>');
  process.exit(1);
}

implementTicket(ticketNum);