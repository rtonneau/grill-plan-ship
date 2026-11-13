// tests/status-json-doc.test.js — docs/STATUS-JSON.md names every field status.js and help.js print.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const h = require('./helpers');

const repoRoot = path.join(__dirname, '..');
const doc = fs.readFileSync(path.join(repoRoot, 'docs', 'STATUS-JSON.md'), 'utf-8');
// A word is named when a code span holds it as a whole word (`{ command, why }` names why).
const codeSpans = [...doc.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);
const named = (word) => codeSpans.some((span) => new RegExp(`(^|[^\\w-])${word}($|[^\\w-])`).test(span));

// Object keys anywhere in `value`, skipping subtrees whose keys are data, not schema.
const OPEN_KEYS = new Set(['meta', 'sections', 'detail']);
function collectKeys(value, out = new Set()) {
  if (Array.isArray(value)) value.forEach((item) => collectKeys(item, out));
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      out.add(key);
      if (!OPEN_KEYS.has(key)) collectKeys(child, out);
    }
  }
  return out;
}

// A project showing every part of the report: seeds, a blocked ticket, a handoff, another worktree.
const root = h.gitProject('gps-doc-');
h.ok(root, 'init.js', ['--apply']);
h.shipReady(root, 'doc', ['a', 'b']);
h.ok(root, 'ticket-start.js', ['1']);
h.ok(root, 'ticket-block.js', ['1', '--reason', 'needs a key']);
h.ok(root, 'handoff.js');
fs.writeFileSync(path.join(h.sessionsDir(root), '.pending-seeds.json'),
  JSON.stringify({ 'safe-linking': { strength: 'Strong', severity: 'Critical', problem: 'p', solution: 's' } }));
const wt = h.json(root, 'start.js', ['there', '--worktree']).worktree;

const status = h.json(root, 'status.js');
assert.ok(status.current.handoff && status.worktrees.length === 1 && status.seeds.length === 1, 'fixture covers every part');
const help = h.json(root, 'help.js', ['ship']);
const missing = [...collectKeys(status), ...collectKeys(help)]
  .filter((key) => !['resumePath', 'planPath', 'ticketsDir', 'existingStubs'].includes(key)) // writeTarget's `…`
  .filter((key) => !named(key));
assert.deepStrictEqual([...new Set(missing)], [], 'fields missing from docs/STATUS-JSON.md');

// Problem codes, including the empty report's.
const empty = h.json(h.tempProject(), 'status.js');
assert.strictEqual(empty.currentProblem.code, 'no-work-dir');
const storeSource = fs.readFileSync(path.join(repoRoot, 'skills', 'gps', 'scripts', 'lib', 'session-store.js'), 'utf-8');
const codes = [...storeSource.matchAll(/^ {2}'([a-z-]+)': \(/gm)].map((m) => m[1]);
assert.ok(codes.length >= 5);
for (const code of ['no-work-dir', ...codes]) assert.ok(named(code), `problem code ${code} is documented`);

// Every event a script records.
const scriptsDir = path.join(repoRoot, 'skills', 'gps', 'scripts');
const sources = [...fs.readdirSync(scriptsDir).filter((f) => f.endsWith('.js')).map((f) => path.join(scriptsDir, f)),
  ...fs.readdirSync(path.join(scriptsDir, 'lib')).filter((f) => f.endsWith('.js')).map((f) => path.join(scriptsDir, 'lib', f))];
const events = new Set();
for (const file of sources) {
  for (const m of fs.readFileSync(file, 'utf-8').matchAll(/event: '([a-z_]+)'/g)) events.add(m[1]);
}
assert.ok(events.has('ticket_resumed') && events.size > 10);
for (const event of events) assert.ok(named(event), `event ${event} is documented`);

// Ticket states and the schema version match the code.
const { TICKET_STATES } = require('../skills/gps/scripts/lib/ticket-state');
const { SCHEMA_VERSION } = require('../skills/gps/scripts/lib/plugin-version');
for (const state of TICKET_STATES) assert.ok(named(state), `state ${state} is documented`);
assert.match(doc, new RegExp(`It is \\*\\*${SCHEMA_VERSION}\\*\\*`));

fs.rmSync(path.dirname(wt.path), { recursive: true, force: true });
h.done('status-json-doc.test.js');
