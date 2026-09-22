#!/usr/bin/env node

/**
 * /gps plan
 *
 * Reads resume.md, creates 02-plan/ + ticket templates.
 * Refuses to run if 02-plan/plan.md already exists (in progress or
 * written), so an existing plan and its tickets are never overwritten.
 */

const fs = require('fs');
const path = require('path');
const { loadTemplate, renderTemplate } = require('./lib/templates');
const { resolveSession } = require('./lib/session-store');
const { resolveWriteTarget, placeholderTester } = require('./lib/write-target');
const { touchPhase } = require('./lib/token-usage');
const { GpsError, writeJsonAtomic, runCli } = require('./lib/guard');

function createPlan() {
  const { sessionId, sessionDir, configPath, config } = resolveSession(process.cwd());
  const resumePath = path.join(sessionDir, '01-grill', 'resume.md');

  if (!fs.existsSync(resumePath)) {
    throw new GpsError(`resume.md not found for ${sessionId}.`, 'Run /gps start <feature-name> first.');
  }

  const planDir = path.join(sessionDir, '02-plan');
  const planPath = path.join(planDir, 'plan.md');
  if (fs.existsSync(planPath)) {
    const pending = resolveWriteTarget(sessionDir).target === 'plan';
    throw new GpsError(
      `A plan already exists for ${sessionId}; nothing was changed.`,
      pending
        ? 'Run /gps write to save the approved plan and tickets.'
        : 'The plan is written. Run /gps ship to implement its tickets, or /gps status.'
    );
  }

  const resumeContent = fs.readFileSync(resumePath, 'utf-8');
  if (placeholderTester(sessionDir)(resumeContent)) {
    throw new GpsError(
      'resume.md still contains unfilled placeholders.',
      `Complete the grill phase with /gps write (fills ${resumePath}) before running /gps plan.`
    );
  }

  const ticketsDir = path.join(planDir, 'tickets');
  fs.mkdirSync(ticketsDir, { recursive: true });

  const planContent = renderTemplate(loadTemplate('02-plan.md'), {
    'feature-name': config.feature_name,
    timestamp: new Date().toISOString(),
  });
  fs.writeFileSync(planPath, planContent);

  const ticketTemplate = loadTemplate('02-ticket.md');
  for (let i = 1; i <= 4; i++) {
    const ticketNum = i.toString().padStart(2, '0');
    const ticketContent = renderTemplate(ticketTemplate, {
      N: ticketNum,
      slug: '[slug]',
    });
    fs.writeFileSync(path.join(ticketsDir, `${ticketNum}-[slug].md`), ticketContent);
  }

  touchPhase(config, 'plan');
  writeJsonAtomic(configPath, config);

  console.log(`✅ Plan directory created`);
  console.log(`Path: ${planDir}`);
  console.log(`\nNext: the writing-plans conversation begins now, followed by an unslop pass`);
  console.log(`on each ticket. Once approved, run /gps write to save the plan + tickets to disk,`);
  console.log(`then /gps ship (or /gps ticket 01) to start implementing.`);
}

runCli(createPlan);
