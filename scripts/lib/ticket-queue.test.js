// scripts/lib/ticket-queue.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { TICKET_MODELS, parseTicketFilename, ticketModel, listTickets } = require('./ticket-queue');

// parseTicketFilename
assert.deepStrictEqual(parseTicketFilename('01-add-login.md'), { num: '01', slug: 'add-login' });
assert.strictEqual(parseTicketFilename('04-[slug].md'), null);
assert.strictEqual(parseTicketFilename('01-Bad Name.md'), null);
assert.strictEqual(parseTicketFilename('not-a-ticket.txt'), null);

// ticketModel: valid values (any case), and "inherit" for missing or unknown ones
assert.strictEqual(ticketModel('# T\n\n**Model:** haiku\n\n**Acceptance Criteria:**\n'), 'haiku');
assert.strictEqual(ticketModel('**Model:**   Sonnet  \n'), 'sonnet');
assert.strictEqual(ticketModel('**Model:** opus\n'), 'opus');
assert.strictEqual(ticketModel('**Model:** inherit\n'), 'inherit');
assert.strictEqual(ticketModel('# T\n\n**Notes:**\nno model line\n'), 'inherit');
assert.strictEqual(ticketModel('**Model:** gpt-9\n'), 'inherit');
assert.strictEqual(ticketModel('**Model:**\n'), 'inherit');
// Fenced examples are content; CRLF files parse; the real line wins over a later fenced one
assert.strictEqual(ticketModel('# T\n\n**Notes:**\n```\n**Model:** opus\n```\n'), 'inherit');
assert.strictEqual(ticketModel('**Model:** haiku\r\n\r\n```\n**Model:** opus\n```\n'), 'haiku');
assert.strictEqual(ticketModel('# T\r\n\r\n**Model:** sonnet\r\n'), 'sonnet');
assert.deepStrictEqual(TICKET_MODELS, ['haiku', 'sonnet', 'opus', 'inherit']);
assert.ok(Object.isFrozen(TICKET_MODELS));

const sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-ticket-queue-'));
const ticketsDir = path.join(sessionDir, '02-plan', 'tickets');

// No 02-plan/tickets/ yet -> empty queue
assert.deepStrictEqual(listTickets(sessionDir), { tickets: [], nextPending: null, skipped: [] });

// Numeric order (100 after 99), duplicate numbers kept alphabetically,
// invalid names skipped
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-ticket-order-'));
  const tdir = path.join(dir, '02-plan', 'tickets');
  fs.mkdirSync(tdir, { recursive: true });
  for (const f of ['100-last.md', '99-before.md', '01-b.md', '01-a.md', '02-[slug].md', 'notes.md']) {
    fs.writeFileSync(path.join(tdir, f), 'x');
  }
  const { tickets, skipped } = listTickets(dir);
  assert.deepStrictEqual(tickets.map((t) => `${t.num}-${t.slug}`), ['01-a', '01-b', '99-before', '100-last']);
  assert.deepStrictEqual(skipped.sort(), ['02-[slug].md', 'notes.md']);
  fs.rmSync(dir, { recursive: true, force: true });
}

fs.mkdirSync(ticketsDir, { recursive: true });
fs.writeFileSync(path.join(ticketsDir, '01-add-login.md'), '# Ticket 1: add-login\n');
fs.writeFileSync(path.join(ticketsDir, '02-add-logout.md'), '# Ticket 2: add-logout\n\n**Model:** haiku\n');

// Neither ticket has a commit-log.md yet -> both pending, nextPending is ticket 1
let result = listTickets(sessionDir);
assert.strictEqual(result.tickets.length, 2);
assert.strictEqual(result.tickets[0].done, false);
assert.strictEqual(result.tickets[1].done, false);
assert.strictEqual(result.nextPending.num, '01');

// Model comes from the ticket's "**Model:**" line; no line means inherit
assert.strictEqual(result.tickets[0].model, 'inherit');
assert.strictEqual(result.tickets[1].model, 'haiku');
assert.strictEqual(result.tickets[0].modelInvalid, null);
assert.strictEqual(result.tickets[1].modelInvalid, null);

// A hand-edited unknown value falls back to inherit and is reported; an
// unreadable ticket (a directory named like one) doesn't break the queue
fs.writeFileSync(path.join(ticketsDir, '03-typo.md'), '**Model:** sonett\n');
fs.mkdirSync(path.join(ticketsDir, '04-unreadable.md'));
result = listTickets(sessionDir);
assert.deepStrictEqual(
  result.tickets.slice(2).map((t) => [t.slug, t.model, t.modelInvalid]),
  [['typo', 'inherit', 'sonett'], ['unreadable', 'inherit', null]]
);
fs.rmSync(path.join(ticketsDir, '03-typo.md'));
fs.rmdirSync(path.join(ticketsDir, '04-unreadable.md'));

// Ticket 1's commit-log.md still has the raw template line -> still pending
const implDir1 = path.join(sessionDir, '03-implement', '01-add-login');
fs.mkdirSync(implDir1, { recursive: true });
fs.writeFileSync(
  path.join(implDir1, 'commit-log.md'),
  '# Ticket 01 Implementation\n\n**Status:** In Progress / ✅ Done\n'
);
result = listTickets(sessionDir);
assert.strictEqual(result.tickets[0].done, false);
assert.strictEqual(result.nextPending.num, '01');

// Ticket 1 marked "In Progress" (blocked) -> still pending
fs.writeFileSync(
  path.join(implDir1, 'commit-log.md'),
  '# Ticket 01 Implementation\n\n**Status:** In Progress\n\n## Blockers / Challenges\n\nStuck.\n'
);
result = listTickets(sessionDir);
assert.strictEqual(result.tickets[0].done, false);
assert.strictEqual(result.nextPending.num, '01');

// Ticket 1 marked done -> nextPending moves to ticket 2
fs.writeFileSync(
  path.join(implDir1, 'commit-log.md'),
  '# Ticket 01 Implementation\n\n**Status:** ✅ Done\n'
);
result = listTickets(sessionDir);
assert.strictEqual(result.tickets[0].done, true);
assert.strictEqual(result.nextPending.num, '02');

// Both tickets done -> nextPending is null
const implDir2 = path.join(sessionDir, '03-implement', '02-add-logout');
fs.mkdirSync(implDir2, { recursive: true });
fs.writeFileSync(
  path.join(implDir2, 'commit-log.md'),
  '# Ticket 02 Implementation\n\n**Status:** ✅ Done\n'
);
result = listTickets(sessionDir);
assert.strictEqual(result.tickets.every((t) => t.done), true);
assert.strictEqual(result.nextPending, null);

fs.rmSync(sessionDir, { recursive: true, force: true });
console.log('ticket-queue.test.js: all assertions passed');
