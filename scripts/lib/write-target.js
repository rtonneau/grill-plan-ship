// scripts/lib/write-target.js
const fs = require('fs');
const path = require('path');

const PLACEHOLDER_RE = /\{\{[^}]+\}\}/;

function hasPlaceholders(filePath) {
  if (!fs.existsSync(filePath)) return true;
  return PLACEHOLDER_RE.test(fs.readFileSync(filePath, 'utf-8'));
}

function resolveWriteTarget(sessionDir) {
  const resumePath = path.join(sessionDir, '01-grill', 'resume.md');
  if (hasPlaceholders(resumePath)) {
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
    (f) => f.includes('[slug]') || PLACEHOLDER_RE.test(
      fs.readFileSync(path.join(ticketsDir, f), 'utf-8')
    )
  );

  if (hasPlaceholders(planPath) || stillUnfilled) {
    return { target: 'plan', planPath, ticketsDir, existingStubs };
  }

  return { target: 'none', reason: 'complete' };
}

module.exports = { resolveWriteTarget };
