// tests/ticket-block.test.js — ticket-block.js (/gps ship: record a blocker)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const h = require('./helpers');

const root = h.gitProject();
h.shipReady(root, 'blocked', ['a', 'b']);
const log = path.join(h.sessionDir(root), '03-implement', '01-a', 'commit-log.md');

h.assertFails(h.run(root, 'ticket-block.js', ['1']), 2, /--reason/);
h.assertFails(h.run(root, 'ticket-block.js', ['1', '--reason', '  ']), 2, /--reason/);
h.assertFails(h.run(root, 'ticket-block.js', ['1', '--reason', 'x']), 1, /never started/);

h.ok(root, 'ticket-start.js', ['1']);
const head = h.git(root, 'rev-parse', 'HEAD');
const res = h.ok(root, 'ticket-block.js', ['1', '--reason', 'needs an API key\nfrom ops']);
assert.match(res.out, /⛔ Ticket 01 \(a\) blocked: needs an API key from ops\n/);
assert.match(res.out, /Stop the ship run/);
let text = fs.readFileSync(log, 'utf-8');
assert.match(text, /\*\*Status:\*\* In Progress/);
assert.match(text, /## Blockers \/ Challenges\n\n\*\*Blocked \(.+\):\*\* needs an API key from ops\n/);
assert.doesNotMatch(text.split('## Blockers / Challenges')[1].split('## Commits')[0], /gps:fill/, 'the marker is replaced');
assert.strictEqual(h.git(root, 'rev-parse', 'HEAD'), head, 'nothing committed');
const event = h.history(root).pop();
assert.strictEqual(event.event, 'ticket_blocked');
assert.deepStrictEqual(event.detail, { ticket: '01-a', reason: 'needs an API key from ops' });

// A second block keeps the first reason.
h.ok(root, 'ticket-block.js', ['1', '--reason', 'still blocked']);
text = fs.readFileSync(log, 'utf-8');
assert.match(text, /needs an API key from ops[\s\S]*still blocked/);
assert.strictEqual(h.json(root, 'ticket-queue.js').nextPending.slug, 'a', 'a blocked ticket is still pending');

// A Done ticket can't be blocked.
h.fillLog(root, '01-a');
fs.writeFileSync(path.join(root, 'a.js'), 'a\n');
h.ok(root, 'ticket-complete.js', ['1', '--message', 'feat: a', '--file', 'a.js']);
h.assertFails(h.run(root, 'ticket-block.js', ['1', '--reason', 'x']), 1, /already Done/);

h.done('ticket-block.test.js');
