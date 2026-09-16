#!/usr/bin/env node

/**
 * /gps plan
 *
 * Reads resume.md, creates 02-plan/ + ticket templates
 */

const fs = require('fs');
const path = require('path');
const { loadTemplate, renderTemplate } = require('./lib/templates');
const { getCurrentSessionId, markPhaseCompleted } = require('./lib/session-store');

function createPlan() {
  const projectRoot = process.cwd();
  const sessionsDir = path.join(projectRoot, '.work', 'sessions');

  if (!fs.existsSync(sessionsDir)) {
    console.error('No sessions found. Run /gps start first.');
    process.exit(1);
  }

  const currentSession = getCurrentSessionId(sessionsDir);
  if (!currentSession) {
    console.error('No sessions found. Run /gps start first.');
    process.exit(1);
  }

  const sessionDir = path.join(sessionsDir, currentSession);
  const resumePath = path.join(sessionDir, '01-grill', 'resume.md');

  if (!fs.existsSync(resumePath)) {
    console.error(`resume.md not found. Run /gps start first.`);
    process.exit(1);
  }

  const resumeContent = fs.readFileSync(resumePath, 'utf-8');
  if (/\{\{[^}]+\}\}/.test(resumeContent)) {
    console.error(
      `resume.md still contains unfilled {{ ... }} placeholders.\n` +
      `Complete the grill phase (fill in ${resumePath}) before running /gps plan.`
    );
    process.exit(1);
  }

  const configPath = path.join(sessionDir, '.session-config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  const planDir = path.join(sessionDir, '02-plan');
  const ticketsDir = path.join(planDir, 'tickets');
  fs.mkdirSync(ticketsDir, { recursive: true });

  const planContent = renderTemplate(loadTemplate('02-plan.md'), {
    'feature-name': config.feature_name,
    timestamp: new Date().toISOString(),
  });
  fs.writeFileSync(path.join(planDir, 'plan.md'), planContent);

  const ticketTemplate = loadTemplate('02-ticket.md');
  for (let i = 1; i <= 4; i++) {
    const ticketNum = i.toString().padStart(2, '0');
    const ticketContent = renderTemplate(ticketTemplate, {
      N: ticketNum,
      slug: '[slug]',
    });
    const ticketPath = path.join(ticketsDir, `${ticketNum}-[slug].md`);
    fs.writeFileSync(ticketPath, ticketContent);
  }

  markPhaseCompleted(config, 'grill');
  config.status = 'plan-in-progress';
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  console.log(`Plan directory created`);
  console.log(`Path: ${planDir}`);
  console.log(`\nNext steps:`);
  console.log(`1. Run /writing-plans to generate your tickets`);
  console.log(`2. Copy ticket content into 02-plan/tickets/`);
  console.log(`3. Run /unslop rewrite on each ticket for crisp language`);
  console.log(`4. Then run /gps ticket 01 to start implementing`);
}

createPlan();
