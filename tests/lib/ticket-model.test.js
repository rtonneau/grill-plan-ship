// tests/lib/ticket-model.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { TICKET_MODELS, readTicketModel, normalizeTicketModel } = require('../../skills/gps/scripts/lib/ticket-model');

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

// The model list in the docs matches the code, so they can't drift apart
const refs = path.join(__dirname, '..', '..', 'skills', 'gps', 'references');
for (const file of ['write.md', 'plan.md', 'ship.md']) {
  const text = fs.readFileSync(path.join(refs, file), 'utf-8');
  for (const model of TICKET_MODELS) {
    assert.ok(text.includes(`\`${model}\``) || text.includes(model), `${file} does not mention model "${model}"`);
  }
}
const writeDoc = fs.readFileSync(path.join(refs, 'write.md'), 'utf-8');
assert.ok(writeDoc.includes(`<${TICKET_MODELS.join(' | ')}>`), 'write.md template line must list every TICKET_MODELS value in order');

console.log('✅ ticket-model tests passed');
