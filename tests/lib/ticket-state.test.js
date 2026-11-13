// tests/lib/ticket-state.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { TICKET_STATES, openBlock, ticketState, withTicketStates } = require('../../skills/gps/scripts/lib/ticket-state');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-ticket-state-'));
const ticket = (num, slug, { done = false, log = false } = {}) => {
  const commitLogPath = path.join(dir, `${num}-${slug}`, 'commit-log.md');
  if (log) {
    fs.mkdirSync(path.dirname(commitLogPath), { recursive: true });
    fs.writeFileSync(commitLogPath, '**Status:** In Progress\n');
  }
  return { num, slug, commitLogPath, done };
};
const ev = (event, at, detail) => ({ at, event, phase: 'ship', ...(detail ? { detail } : {}) });

assert.deepStrictEqual(TICKET_STATES, ['pending', 'started', 'blocked', 'done']);

// pending: no log, no event
assert.deepStrictEqual(ticketState(ticket('01', 'a'), []), { state: 'pending', blocker: null });
// started: by the log, or by a ticket_started event alone
assert.deepStrictEqual(ticketState(ticket('02', 'b', { log: true }), []), { state: 'started', blocker: null });
assert.strictEqual(ticketState(ticket('03', 'c'), [ev('ticket_started', 't1', { ticket: '03-c' })]).state, 'started');
assert.strictEqual(ticketState(ticket('03', 'c'), [ev('ticket_started', 't1', { ticket: '03-x' })]).state, 'pending');

// blocked, then resumed, then blocked again, then done
const history = [
  ev('ticket_started', 't1', { ticket: '02-b' }),
  ev('ticket_blocked', 't2', { ticket: '02-b', reason: 'needs a key' }),
];
assert.deepStrictEqual(ticketState(ticket('02', 'b', { log: true }), history),
  { state: 'blocked', blocker: { reason: 'needs a key', at: 't2' } });
history.push(ev('ticket_resumed', 't3', { ticket: '02-b' }));
assert.deepStrictEqual(ticketState(ticket('02', 'b', { log: true }), history), { state: 'started', blocker: null });
history.push(ev('ticket_blocked', 't4', { ticket: '02-b', reason: 'tests fail' }));
assert.deepStrictEqual(openBlock(history, '02-b'), { reason: 'tests fail', at: 't4' });
assert.strictEqual(openBlock(history, '01-a'), null, 'another ticket\'s block is not this one\'s');
history.push(ev('ticket_done', 't5', { ticket: '02-b', commit: 'abc' }));
assert.strictEqual(openBlock(history, '02-b'), null);

// session_finished closes every open block
const finished = [ev('ticket_blocked', 't1', { ticket: '01-a', reason: 'r' }), ev('session_finished', 't2')];
assert.strictEqual(ticketState(ticket('01', 'a', { log: true }), finished).state, 'started');

// A log set to Done by hand wins over an open block
const handDone = [ev('ticket_blocked', 't1', { ticket: '01-a', reason: 'r' })];
assert.deepStrictEqual(ticketState(ticket('01', 'a', { log: true, done: true }), handDone), { state: 'done', blocker: null });

// A block with no reason, malformed entries and a missing history are tolerated
assert.deepStrictEqual(openBlock([null, { event: 'ticket_blocked', detail: { ticket: '01-a' } }], '01-a'), { reason: null, at: null });
assert.strictEqual(ticketState(ticket('09', 'z'), undefined).state, 'pending');

// withTicketStates keeps every field and adds state and blocker
const [withState] = withTicketStates([{ ...ticket('01', 'a'), model: 'fast' }], handDone);
assert.strictEqual(withState.model, 'fast');
assert.strictEqual(withState.state, 'blocked');
assert.deepStrictEqual(withState.blocker, { reason: 'r', at: 't1' });

fs.rmSync(dir, { recursive: true, force: true });
console.log('ticket-state.test.js: all assertions passed');
