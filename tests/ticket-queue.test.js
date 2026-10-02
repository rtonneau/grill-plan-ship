// tests/ticket-queue.test.js — ticket-queue.js (/gps ship: the queue and model hints)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const h = require('./helpers');

const root = h.gitProject();
h.ok(root, 'start.js', ['queue']);

// Refused until the plan is written.
h.assertFails(h.run(root, 'ticket-queue.js'), 1, /grill phase is not written/);
h.writeGrill(root);
h.ok(root, 'plan.js');
h.assertFails(h.run(root, 'ticket-queue.js'), 1, /\/gps write/);
const prep = h.json(root, 'write-prepare.js');
fs.writeFileSync(prep.payloadPath, h.planPayload(prep, [{ slug: 'toggle', model: 'haiku' }, { slug: 'persist', model: 'opus' }, { slug: 'docs' }]));
h.ok(root, 'write-apply.js');

// Text: one line per ticket, next pending, and the model-hint lines ship asks about.
let res = h.ok(root, 'ticket-queue.js');
assert.match(res.out, /0\/3 done/);
assert.match(res.out, /- 01 toggle — pending — model haiku/);
assert.match(res.out, /Next pending: 01 toggle/);
assert.match(res.out, /Model hints of the remaining tickets:\n1: haiku\n2: opus\n3: inherit/);

// No ship mode recorded yet: no "Last ship mode" line.
assert.doesNotMatch(res.out, /Last ship mode/);
assert.strictEqual(h.json(root, 'ticket-queue.js').shipMode, null);

// JSON: the full queue.
let data = h.json(root, 'ticket-queue.js');
assert.deepStrictEqual(data.tickets.map((t) => [t.num, t.slug, t.model, t.done]),
  [['01', 'toggle', 'haiku', false], ['02', 'persist', 'opus', false], ['03', 'docs', 'inherit', false]]);
assert.strictEqual(data.nextPending.slug, 'toggle');

// A hand-edited unknown model warns and counts as inherit; a badly named file is skipped.
const ticketsDir = path.join(h.sessionDir(root), '02-plan', 'tickets');
const persist = path.join(ticketsDir, '02-persist.md');
fs.writeFileSync(persist, fs.readFileSync(persist, 'utf-8').replace('**Model:** opus', '**Model:** sonett'));
fs.writeFileSync(path.join(ticketsDir, 'notes.md'), 'stray');
res = h.ok(root, 'ticket-queue.js');
assert.match(res.err, /⚠️ {2}Ticket 02-persist: unknown model "sonett", using inherit/);
assert.match(res.err, /⚠️ {2}Skipped notes\.md/);
assert.match(res.out, /2: inherit/);

// The mode ticket-start.js recorded is offered back.
h.ok(root, 'ticket-start.js', ['--mode', 'subagent']);
assert.match(h.ok(root, 'ticket-queue.js').out, /3 done\.\nLast ship mode: subagent\n/);
assert.strictEqual(h.json(root, 'ticket-queue.js').shipMode, 'subagent');

// Done tickets drop out of the hints; all done points at /gps finish.
h.completeTicket(root, 1, 'toggle');
data = h.json(root, 'ticket-queue.js');
assert.strictEqual(data.nextPending.slug, 'persist');
assert.doesNotMatch(h.ok(root, 'ticket-queue.js').out, /\n1: haiku/);
h.completeTicket(root, 2, 'persist');
h.completeTicket(root, 3, 'docs');
assert.match(h.ok(root, 'ticket-queue.js').out, /3\/3 done[\s\S]*All tickets are done\. Next: \/gps finish/);
assert.strictEqual(h.json(root, 'ticket-queue.js').nextPending, null);

// Read-only, takes no arguments.
h.assertFails(h.run(root, 'ticket-queue.js', ['1']), 2);

h.done('ticket-queue.test.js');
