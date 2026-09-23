// scripts/lib/write-target.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveWriteTarget, placeholderTester, checkPlanWritten } = require('./write-target');

const sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-write-target-'));
const grillDir = path.join(sessionDir, '01-grill');
const planDir = path.join(sessionDir, '02-plan');
const ticketsDir = path.join(planDir, 'tickets');
const resumePath = path.join(grillDir, 'resume.md');
const planPath = path.join(planDir, 'plan.md');

fs.mkdirSync(grillDir, { recursive: true });

// resume.md missing entirely -> still grill
assert.strictEqual(resolveWriteTarget(sessionDir).target, 'grill');

// resume.md present but still has {{ }} placeholders -> grill
fs.writeFileSync(resumePath, '# Session\n\n{{ Problem statement }}\n');
assert.strictEqual(resolveWriteTarget(sessionDir).target, 'grill');

// resume.md filled in, no 02-plan/ yet -> none (plan-not-started)
fs.writeFileSync(resumePath, '# Session\n\nActual problem statement.\n');
let result = resolveWriteTarget(sessionDir);
assert.strictEqual(result.target, 'none');
assert.strictEqual(result.reason, 'plan-not-started');

// 02-plan/plan.md created by /gps plan, still has placeholders -> plan
fs.mkdirSync(ticketsDir, { recursive: true });
fs.writeFileSync(planPath, '# Plan\n\n{{ High-level approach }}\n');
fs.writeFileSync(path.join(ticketsDir, '01-[slug].md'), '# Ticket 1: {{ slug }}\n');
result = resolveWriteTarget(sessionDir);
assert.strictEqual(result.target, 'plan');
assert.deepStrictEqual(result.existingStubs, ['01-[slug].md']);

// plan.md filled, but a ticket stub filename still has [slug] -> still plan
fs.writeFileSync(planPath, '# Plan\n\nActual strategy.\n');
assert.strictEqual(resolveWriteTarget(sessionDir).target, 'plan');

// plan.md and real ticket both filled in -> none (complete)
fs.rmSync(path.join(ticketsDir, '01-[slug].md'));
fs.writeFileSync(path.join(ticketsDir, '01-add-login.md'), '# Ticket 1: add-login\n\nReal content.\n');
result = resolveWriteTarget(sessionDir);
assert.strictEqual(result.target, 'none');
assert.strictEqual(result.reason, 'complete');

fs.rmSync(sessionDir, { recursive: true, force: true });

// template_version 2: only <!-- gps:fill --> markers count; legitimate
// {{ ... }} content (Vue, Jinja, ...) no longer blocks the phase.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-write-target-v2-'));
  fs.mkdirSync(path.join(dir, '01-grill'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.session-config.json'), JSON.stringify({ template_version: 2 }));
  const resume = path.join(dir, '01-grill', 'resume.md');

  fs.writeFileSync(resume, '## Problem\n\n<!-- gps:fill What are we solving? -->\n');
  assert.strictEqual(resolveWriteTarget(dir).target, 'grill');

  fs.writeFileSync(resume, '## Problem\n\nRender `{{ user.name }}` in the Vue header.\n');
  assert.strictEqual(resolveWriteTarget(dir).target, 'none');

  // A plain HTML comment is not a placeholder either
  fs.writeFileSync(resume, '## Problem\n\n<!-- reviewer note -->\nDone.\n');
  assert.strictEqual(resolveWriteTarget(dir).target, 'none');

  const tester = placeholderTester(dir);
  assert.ok(tester('<!--gps:fill x-->'));
  assert.ok(!tester('{{ x }}'));
  assert.ok(placeholderTester(path.join(dir, 'no-config'))('{{ x }}')); // legacy default
  fs.rmSync(dir, { recursive: true, force: true });
}

// checkPlanWritten: the old mark-plan-written.js checks
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-check-plan-'));
  fs.writeFileSync(path.join(dir, '.session-config.json'), JSON.stringify({ template_version: 2 }));
  fs.mkdirSync(path.join(dir, '01-grill'), { recursive: true });
  fs.writeFileSync(path.join(dir, '01-grill', 'resume.md'), '<!-- gps:fill x -->');
  assert.throws(() => checkPlanWritten(dir), /grill phase is not written/);

  fs.writeFileSync(path.join(dir, '01-grill', 'resume.md'), 'done');
  assert.throws(() => checkPlanWritten(dir), /no plan yet/);

  const tickets = path.join(dir, '02-plan', 'tickets');
  fs.mkdirSync(tickets, { recursive: true });
  fs.writeFileSync(path.join(dir, '02-plan', 'plan.md'), 'done');
  fs.writeFileSync(path.join(tickets, '01-[slug].md'), 'stub');
  assert.throws(() => checkPlanWritten(dir), /not fully written/);

  fs.unlinkSync(path.join(tickets, '01-[slug].md'));
  assert.throws(() => checkPlanWritten(dir), /no valid ticket files/);

  fs.writeFileSync(path.join(tickets, '01-a.md'), 'real');
  fs.writeFileSync(path.join(tickets, 'notes.md'), 'real');
  const result = checkPlanWritten(dir);
  assert.deepStrictEqual(result.tickets.map((t) => t.slug), ['a']);
  assert.deepStrictEqual(result.skipped, ['notes.md']);
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('write-target.test.js: all assertions passed');
