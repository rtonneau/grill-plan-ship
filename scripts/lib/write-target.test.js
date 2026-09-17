// scripts/lib/write-target.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveWriteTarget } = require('./write-target');

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
console.log('write-target.test.js: all assertions passed');
