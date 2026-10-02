// tests/helpers.js
//
// Shared fixtures for the script tests: run a real script in a throwaway
// project, and drive a session to a given phase through the scripts
// themselves (never by writing session state by hand).

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const SCRIPTS = path.join(__dirname, '..', 'skills', 'gps', 'scripts');
const SKILL_DIR = path.join(__dirname, '..', 'skills', 'gps');

function tempProject(prefix = 'gps-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// Runs scripts/<script> in `cwd`: { code, out, err }.
function run(cwd, script, args = [], env = {}) {
  const result = spawnSync(process.execPath, [path.join(SCRIPTS, script), ...args], {
    cwd, encoding: 'utf-8', env: { ...process.env, CLAUDE_CODE_SESSION_ID: '', ...env },
  });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

// Runs a script that must succeed; returns its result.
function ok(cwd, script, args = [], env = {}) {
  const res = run(cwd, script, args, env);
  assert.strictEqual(res.code, 0, `${script} ${args.join(' ')} failed (exit ${res.code}):\n${res.err}`);
  return res;
}

// Runs a script with --json that must succeed; returns its parsed data.
function json(cwd, script, args = [], env = {}) {
  return JSON.parse(ok(cwd, script, [...args, '--json'], env).out);
}

// A failure must be a clean "❌" message, never a stack trace.
function assertFails(res, code, pattern) {
  assert.strictEqual(res.code, code, `expected exit ${code}, got ${res.code}:\n${res.out}${res.err}`);
  assert.match(res.err, /❌ /);
  assert.doesNotMatch(res.err, /\n\s+at /, 'no stack trace');
  if (pattern) assert.match(res.err, pattern);
}

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

// A project that is a git repo with one commit.
function gitProject(prefix) {
  const root = tempProject(prefix);
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test');
  fs.writeFileSync(path.join(root, 'app.js'), 'console.log(1);\n');
  git(root, 'add', 'app.js');
  git(root, 'commit', '-q', '-m', 'initial');
  return root;
}

const sessionsDir = (root) => path.join(root, '.work', 'sessions');
const currentSession = (root) => fs.readFileSync(path.join(sessionsDir(root), '.current-session'), 'utf-8').trim();
const sessionDir = (root) => path.join(sessionsDir(root), currentSession(root));
const configPath = (root) => path.join(sessionDir(root), '.session-config.json');
const readConfig = (root) => JSON.parse(fs.readFileSync(configPath(root), 'utf-8'));
const history = (root) => readConfig(root).history || [];

// Every gps:fill marker of a skeleton replaced by `value`.
function fillSkeleton(skeleton, value = 'Agreed.') {
  return skeleton.replace(/<!--\s*gps:fill[\s\S]*?-->/g, value);
}

// Saves the grill through write-prepare + write-apply; `sections` overrides
// the body of chosen headings (e.g. { 'Problem Statement': '...' }).
function writeGrill(root, sections = {}, env = {}) {
  const prep = json(root, 'write-prepare.js', [], env);
  assert.strictEqual(prep.target, 'grill');
  fs.writeFileSync(prep.payloadPath, prep.sections
    .map((h) => `## ${h}\n\n${sections[h] || `${h} content.`}\n`).join('\n'));
  return ok(root, 'write-apply.js', [], env);
}

// The plan payload for `tickets` ([{ slug, model?, body? }]); `branch` adds
// a **Branch:** line.
function planPayload(prep, tickets, { branch } = {}) {
  const fields = prep.fields.filter((f) => f !== 'Branch').map((f) => `**${f}:** 1 day`);
  if (branch !== undefined) fields.unshift(`**Branch:** ${branch}`);
  const sections = prep.sections.map((h) => `## ${h}\n\n${h} content.\n`).join('\n');
  const blocks = tickets.map((t, i) => [
    `--- ticket: ${String(i + 1).padStart(2, '0')}-${t.slug} ---`,
    t.model ? `**Model:** ${t.model}\n` : '',
    t.body || `Do ${t.slug}.`,
  ].join('\n')).join('\n\n');
  return `${fields.join('\n')}\n\n${sections}\n${blocks}\n`;
}

// Starts the plan and saves `slugs` as its tickets.
function writePlan(root, tickets, options = {}, env = {}) {
  ok(root, 'plan.js', [], env);
  const prep = json(root, 'write-prepare.js', [], env);
  assert.strictEqual(prep.target, 'plan');
  fs.writeFileSync(prep.payloadPath, planPayload(prep, tickets.map((t) => (typeof t === 'string' ? { slug: t } : t)), options));
  return ok(root, 'write-apply.js', [], env);
}

// A session in the ship phase: started, grill and plan saved.
function shipReady(root, name, tickets, options = {}) {
  ok(root, 'start.js', [name]);
  writeGrill(root);
  writePlan(root, tickets, options);
}

// Fills the narrative sections of ticket <num>'s commit log.
function fillLog(root, implName) {
  const log = path.join(sessionDir(root), '03-implement', implName, 'commit-log.md');
  fs.writeFileSync(log, fillSkeleton(fs.readFileSync(log, 'utf-8'), 'Checked.'));
  return log;
}

// Starts, implements (one file) and completes ticket <num> through the scripts.
function completeTicket(root, num, slug, env = {}) {
  ok(root, 'ticket-start.js', [String(num)], env);
  fillLog(root, `${String(num).padStart(2, '0')}-${slug}`);
  const file = `${slug}.js`;
  fs.writeFileSync(path.join(root, file), `// ${slug} ${Date.now()}\n`);
  return ok(root, 'ticket-complete.js', [String(num), '--message', `feat: ${slug}`, '--file', file], env);
}

function done(name) {
  console.log(`${name}: all assertions passed`);
}

module.exports = {
  SCRIPTS, SKILL_DIR, tempProject, run, ok, json, assertFails, git, gitProject,
  sessionsDir, currentSession, sessionDir, configPath, readConfig, history,
  fillSkeleton, writeGrill, planPayload, writePlan, shipReady, fillLog, completeTicket, done,
};
