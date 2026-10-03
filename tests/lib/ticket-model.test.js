// tests/lib/ticket-model.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  TICKET_MODELS, TICKET_EFFORTS, MAX_EFFORT_REASON, readTicketModel, readTicketEffort, normalizeTicketModel, normalizeTicketEffort,
} = require('../../skills/gps/scripts/lib/ticket-model');

// readTicketModel: raw value of the first line outside code fences
assert.strictEqual(readTicketModel('# T\n\n**Model:** haiku\n'), 'haiku');
assert.strictEqual(readTicketModel('# T\n'), null);
assert.strictEqual(readTicketModel('**Model:**\n'), '');
assert.strictEqual(readTicketModel('~~~\n**Model:** opus\n~~~\n**Model:** haiku\n'), 'haiku');
assert.strictEqual(readTicketModel('````\n```\n**Model:** opus\n```\n````\n'), null);
assert.strictEqual(readTicketModel('﻿**Model:** opus\r\n'), 'opus');

// normalizeTicketModel: { model, raw }
assert.deepStrictEqual(normalizeTicketModel('**Model:** Opus\n'), { model: 'opus', raw: 'Opus' });
assert.deepStrictEqual(normalizeTicketModel('**Model:** gpt-9\n'), { model: 'inherit', raw: 'gpt-9' });
assert.deepStrictEqual(normalizeTicketModel('no line\n'), { model: 'inherit', raw: null });

// readTicketEffort / normalizeTicketEffort: same rules as the model line
assert.strictEqual(readTicketEffort('**Model:** haiku\n**Effort:** high\n'), 'high');
assert.strictEqual(readTicketEffort('```\n**Effort:** low\n```\n'), null);
assert.deepStrictEqual(normalizeTicketEffort('**Effort:** XHigh\n'), { effort: 'xhigh', raw: 'XHigh' });
assert.deepStrictEqual(normalizeTicketEffort('**Effort:** turbo\n'), { effort: 'inherit', raw: 'turbo' });
assert.deepStrictEqual(normalizeTicketEffort('no line\n'), { effort: 'inherit', raw: null });

// Decision 0001: effort hints stop at xhigh. max is not a value, and the
// reason is spelled out wherever it is refused.
assert.deepStrictEqual([...TICKET_EFFORTS], ['low', 'medium', 'high', 'xhigh', 'inherit']);
assert.ok(!TICKET_EFFORTS.includes('max'));
assert.deepStrictEqual(normalizeTicketEffort('**Effort:** max\n'), { effort: 'inherit', raw: 'max' });
assert.match(MAX_EFFORT_REASON, /stop at xhigh/);
assert.ok(fs.existsSync(path.join(__dirname, '..', '..', 'docs', 'decisions', '0001-effort-hints-stop-at-xhigh.md')), 'decision 0001 is recorded');

// The model list in the docs matches the code, so they can't drift apart
const refs = path.join(__dirname, '..', '..', 'skills', 'gps', 'references');
for (const file of ['plan.md', 'ship.md']) {
  const text = fs.readFileSync(path.join(refs, file), 'utf-8');
  for (const model of TICKET_MODELS) {
    assert.ok(text.includes(`\`${model}\``) || text.includes(model), `${file} does not mention model "${model}"`);
  }
  for (const effort of TICKET_EFFORTS) {
    assert.ok(text.includes(effort), `${file} does not mention effort "${effort}"`);
  }
}
// The payload skeleton's ticket block lists every value, in order.
const ticketTemplate = fs.readFileSync(path.join(__dirname, '..', '..', 'skills', 'gps', 'assets', '02-ticket.md'), 'utf-8');
assert.ok(ticketTemplate.includes(TICKET_MODELS.join(' | ')), '02-ticket.md must list every TICKET_MODELS value in order');
assert.ok(ticketTemplate.includes(TICKET_EFFORTS.join(' | ')), '02-ticket.md must list every TICKET_EFFORTS value in order');

console.log('✅ ticket-model tests passed');
