// scripts/lib/auto-route.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { computeRoute } = require('./auto-route');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-auto-route-'));
const grillDir = path.join(dir, '01-grill');
const ticketsDir = path.join(dir, '02-plan', 'tickets');
const resumePath = path.join(grillDir, 'resume.md');
const planPath = path.join(dir, '02-plan', 'plan.md');
const config = { template_version: 2 };
const isGpsError = (pattern, hintPattern) => (e) => e.name === 'GpsError'
  && pattern.test(e.message) && (!hintPattern || hintPattern.test(e.hint));

// grill phase: the whole pipeline
fs.mkdirSync(grillDir, { recursive: true });
fs.writeFileSync(resumePath, '# Session\n\n<!-- gps:fill Problem statement -->\n');
assert.deepStrictEqual(computeRoute(dir, config).steps, ['write:grill', 'plan', 'write:plan', 'ship', 'finish']);
assert.strictEqual(computeRoute(dir, config).target, 'finish');
assert.deepStrictEqual(computeRoute(dir, config, 'plan').steps, ['write:grill', 'plan', 'write:plan']);
assert.deepStrictEqual(computeRoute(dir, config, 'ship').questions, ['ship-mode']);
assert.deepStrictEqual(computeRoute(dir, config, 'plan').questions, []);

// preset ship mode replaces the question, only when the route ships
const delegated = computeRoute(dir, config, 'ship', { shipMode: 'subagent+inline' });
assert.deepStrictEqual(delegated.questions, []);
assert.strictEqual(delegated.shipMode, 'subagent+inline');
assert.strictEqual(computeRoute(dir, config, 'ship').shipMode, undefined);
const planOnly = computeRoute(dir, config, 'plan', { shipMode: 'subagent+inline' });
assert.deepStrictEqual(planOnly.questions, []);
assert.strictEqual(planOnly.shipMode, undefined);

// resume written, no plan: starts at plan
fs.writeFileSync(resumePath, '# Session\n\nActual problem statement.\n');
assert.deepStrictEqual(computeRoute(dir, config).steps, ['plan', 'write:plan', 'ship', 'finish']);

// plan stub pending: starts at write:plan
fs.mkdirSync(ticketsDir, { recursive: true });
fs.writeFileSync(planPath, '# Plan\n\n<!-- gps:fill High-level approach -->\n');
fs.writeFileSync(path.join(ticketsDir, '01-[slug].md'), '# Ticket 1\n');
assert.deepStrictEqual(computeRoute(dir, config, 'ship').steps, ['write:plan', 'ship']);

// plan written: starts at ship; target plan is already done
fs.writeFileSync(planPath, '# Plan\n\nActual strategy.\n');
fs.rmSync(path.join(ticketsDir, '01-[slug].md'));
fs.writeFileSync(path.join(ticketsDir, '01-add-login.md'), '# Ticket 1: add-login\n\nReal content.\n');
assert.deepStrictEqual(computeRoute(dir, config).steps, ['ship', 'finish']);
assert.throws(() => computeRoute(dir, config, 'plan'), isGpsError(/Target "plan" is already done/, /ship, finish/));

// invalid targets never fall back to a default
for (const bad of ['Finish', 'write', '']) {
  assert.throws(() => computeRoute(dir, config, bad), isGpsError(/plan, ship, finish/));
}

// finished session
assert.throws(() => computeRoute(dir, { ...config, finished_at: '2026-09-30T10:00:00Z' }), isGpsError(/already finished/));

fs.rmSync(dir, { recursive: true, force: true });
