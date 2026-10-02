// tests/lib/ticket-lookup.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readyTickets, findTicketsByNumber, findTicketByNumber } = require('../../skills/gps/scripts/lib/ticket-lookup');

const sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-lookup-'));
fs.writeFileSync(path.join(sessionDir, '.session-config.json'), JSON.stringify({ template_version: 2 }));
const write = (rel, text) => {
  fs.mkdirSync(path.dirname(path.join(sessionDir, rel)), { recursive: true });
  fs.writeFileSync(path.join(sessionDir, rel), text);
};

// Phase checks come first, in pipeline order.
write('01-grill/resume.md', '# S\n\n<!-- gps:fill x -->\n');
assert.throws(() => readyTickets(sessionDir), /grill phase is not written/);
write('01-grill/resume.md', '# S\n\nDone.\n');
assert.throws(() => readyTickets(sessionDir), /no tickets yet/);
write('02-plan/plan.md', '# Plan\n\n<!-- gps:fill x -->\n');
assert.throws(() => readyTickets(sessionDir), /plan and tickets are not written/);
write('02-plan/plan.md', '# Plan\n\nDone.\n');
fs.mkdirSync(path.join(sessionDir, '02-plan', 'tickets'));
assert.throws(() => readyTickets(sessionDir), /No tickets found/);

// Duplicates by number are all kept, in filename order; the first not-done one wins.
write('02-plan/tickets/01-b.md', '# Ticket 01: b\n');
write('02-plan/tickets/01-a.md', '# Ticket 01: a\n');
write('02-plan/tickets/2-c.md', '# Ticket 2: c\n');
assert.deepStrictEqual(readyTickets(sessionDir).tickets.map((t) => `${t.num}-${t.slug}`), ['01-a', '01-b', '2-c']);
assert.deepStrictEqual(findTicketsByNumber(sessionDir, 1).map((t) => t.slug), ['a', 'b']);
assert.strictEqual(findTicketByNumber(sessionDir, 2).slug, 'c');
assert.throws(() => findTicketsByNumber(sessionDir, 9), /Ticket 9 not found/);
assert.strictEqual(findTicketByNumber(sessionDir, 1).slug, 'a');
write('03-implement/01-a/commit-log.md', '**Status:** ✅ Done\n');
assert.strictEqual(findTicketByNumber(sessionDir, 1).slug, 'b');
write('03-implement/01-b/commit-log.md', '**Status:** ✅ Done\n');
assert.strictEqual(findTicketByNumber(sessionDir, 1).slug, 'a', 'all done: the first one');

fs.rmSync(sessionDir, { recursive: true, force: true });
console.log('ticket-lookup.test.js: all assertions passed');
