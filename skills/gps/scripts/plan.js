#!/usr/bin/env node

/**
 * plan.js [--json]
 *
 * /gps plan: starts the plan phase once the grill is saved: creates
 * 02-plan/plan.md from its template, which marks the plan as pending for
 * /gps write. Refuses (changing nothing) while resume.md has placeholders
 * or when plan.md already exists, so a plan and its tickets are never
 * overwritten.
 */

const fs = require('fs');
const path = require('path');
const { main } = require('./lib/cli');
const { loadTemplate, renderTemplate } = require('./lib/templates');
const { resolveSession } = require('./lib/session-store');
const { resolveWriteTarget, placeholderTester } = require('./lib/write-target');
const { recordEvent } = require('./lib/history');
const { GpsError } = require('./lib/guard');

main({
  usage: 'plan.js [--json]',
  run({ projectRoot }) {
    const { sessionId, sessionDir, configPath, config } = resolveSession(projectRoot);
    const resumePath = path.join(sessionDir, '01-grill', 'resume.md');
    if (!fs.existsSync(resumePath)) {
      throw new GpsError(`resume.md not found for ${sessionId}.`, 'Run /gps start <feature-name> first.');
    }

    const planPath = path.join(sessionDir, '02-plan', 'plan.md');
    if (fs.existsSync(planPath)) {
      const pending = resolveWriteTarget(sessionDir).target === 'plan';
      throw new GpsError(
        `A plan already exists for ${sessionId}; nothing was changed.`,
        pending
          ? 'Run /gps write (or /gps ship) to save the approved plan and tickets.'
          : 'The plan is written. Run /gps ship to implement its tickets, or /gps status.'
      );
    }
    if (placeholderTester(sessionDir)(fs.readFileSync(resumePath, 'utf-8'))) {
      throw new GpsError(
        'resume.md still contains unfilled placeholders.',
        `Save the approved grill first (write-prepare.js, then write-apply.js fills ${resumePath}).`
      );
    }

    fs.mkdirSync(path.dirname(planPath), { recursive: true });
    fs.writeFileSync(planPath, renderTemplate(loadTemplate('02-plan.md'), {
      'feature-name': config.feature_name,
      timestamp: new Date().toISOString(),
    }));
    recordEvent(configPath, config, sessionDir, { event: 'plan_started', files: ['02-plan/plan.md'] });

    return {
      text: `✅ Plan started for ${sessionId}: ${planPath}\n`
        + 'Next: draft the tickets (writing-plans, then unslop), each with a **Model:** hint; once they are approved, /gps ship saves and implements them.',
      data: { sessionId, planPath, resumePath },
    };
  },
});
