// scripts/lib/write-target.js
const fs = require('fs');
const path = require('path');
const { listTickets } = require('./ticket-queue');
const { GpsError } = require('./guard');

// Current templates mark unfilled content with <!-- gps:fill ... -->, so
// legitimate "{{ ... }}" in user content (Vue, Jinja, Handlebars, Go
// templates) is never mistaken for a placeholder. Sessions created before
// template_version 2 used "{{ ... }}" placeholders; for them both forms
// are detected.
const TEMPLATE_VERSION = 2;
const FILL_RE = /<!--\s*gps:fill\b/;
const LEGACY_PLACEHOLDER_RE = /\{\{[^}]+\}\}/;

function readTemplateVersion(sessionDir) {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(sessionDir, '.session-config.json'), 'utf-8'));
    return Number(config.template_version) || 1;
  } catch (_err) {
    return 1;
  }
}

// Returns a function telling whether a piece of text still has unfilled
// placeholders, according to the session's template version.
function placeholderTester(sessionDir) {
  const legacy = readTemplateVersion(sessionDir) < TEMPLATE_VERSION;
  return (text) => FILL_RE.test(text) || (legacy && LEGACY_PLACEHOLDER_RE.test(text));
}

function hasPlaceholders(filePath, isUnfilled) {
  if (!fs.existsSync(filePath)) return true;
  return isUnfilled(fs.readFileSync(filePath, 'utf-8'));
}

function resolveWriteTarget(sessionDir) {
  const isUnfilled = placeholderTester(sessionDir);
  const resumePath = path.join(sessionDir, '01-grill', 'resume.md');
  if (hasPlaceholders(resumePath, isUnfilled)) {
    return { target: 'grill', resumePath };
  }

  const planPath = path.join(sessionDir, '02-plan', 'plan.md');
  if (!fs.existsSync(planPath)) {
    return { target: 'none', reason: 'plan-not-started' };
  }

  const ticketsDir = path.join(sessionDir, '02-plan', 'tickets');
  const existingStubs = fs.existsSync(ticketsDir)
    ? fs.readdirSync(ticketsDir).filter((f) => f.endsWith('.md'))
    : [];

  const stillUnfilled = existingStubs.some(
    (f) => f.includes('[slug]') || isUnfilled(fs.readFileSync(path.join(ticketsDir, f), 'utf-8'))
  );

  if (hasPlaceholders(planPath, isUnfilled) || stillUnfilled) {
    return { target: 'plan', planPath, ticketsDir, existingStubs };
  }

  return { target: 'none', reason: 'complete' };
}

// Verifies the plan phase is fully written: no placeholders, no [slug]
// stubs, at least one NN-<slug>.md ticket. Returns the tickets and any
// skipped (badly named) files; throws a GpsError listing what is missing.
function checkPlanWritten(sessionDir) {
  const writeTarget = resolveWriteTarget(sessionDir);
  if (writeTarget.target === 'grill') {
    throw new GpsError('The grill phase is not written yet.', 'Run /gps write for the grill phase first.');
  }
  if (writeTarget.reason === 'plan-not-started') {
    throw new GpsError('This session has no plan yet.', 'Run /gps plan first.');
  }
  if (writeTarget.target === 'plan') {
    throw new GpsError(
      `The plan is not fully written: plan.md or a ticket still has placeholders, or a [slug] stub remains (${writeTarget.existingStubs.join(', ') || 'no ticket files'}).`,
      'Fix the payload and run /gps write again.'
    );
  }

  const { tickets, skipped } = listTickets(sessionDir);
  if (tickets.length === 0) {
    throw new GpsError('The plan has no valid ticket files.', 'Write at least one 02-plan/tickets/NN-<slug>.md.');
  }
  return { tickets, skipped };
}

module.exports = { TEMPLATE_VERSION, placeholderTester, resolveWriteTarget, checkPlanWritten };
