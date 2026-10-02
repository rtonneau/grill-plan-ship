// tests/write-prepare.test.js — write-prepare.js (/gps write, step 1)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const h = require('./helpers');

const GRILL_SECTIONS = [
  'Problem Statement', 'Context & Constraints', 'Success Metrics', 'Architecture & Approach',
  'Assumptions & Trade-offs', 'Open Questions', 'Notes',
];

{
  const root = h.tempProject();
  h.assertFails(h.run(root, 'write-prepare.js'), 1, /No sessions found/);
  h.ok(root, 'start.js', ['contract']);

  // Grill pending: payload path, sections and a skeleton with every gap marked.
  const grill = h.json(root, 'write-prepare.js');
  assert.strictEqual(grill.target, 'grill');
  assert.strictEqual(grill.payloadPath, path.join(h.sessionDir(root), '.write-payload.md'));
  assert.deepStrictEqual(grill.sections, GRILL_SECTIONS);
  assert.deepStrictEqual(grill.fields, []);
  assert.strictEqual(grill.existingPayload, false);
  assert.strictEqual(grill.ticketSeparator, undefined);
  for (const heading of GRILL_SECTIONS) assert.ok(grill.skeleton.includes(`## ${heading}\n`), heading);
  assert.doesNotMatch(grill.skeleton, /Token Usage/);
  assert.match(grill.skeleton, /gps:fill/);
  assert.ok(!fs.existsSync(grill.payloadPath), 'write-prepare never writes the payload');

  // Text mode prints the skeleton in a fence, with the instructions.
  const text = h.ok(root, 'write-prepare.js').out;
  assert.match(text, /^Pending: the grill phase/);
  assert.match(text, /Write the payload to .*\.write-payload\.md in one Write call/);
  assert.match(text, /````markdown\n## Problem Statement/);

  // The filled skeleton is a valid payload as is.
  fs.writeFileSync(grill.payloadPath, h.fillSkeleton(grill.skeleton));
  h.ok(root, 'write-apply.js');

  // Nothing pending is not an error: it names the next command.
  const none = h.ok(root, 'write-prepare.js');
  assert.match(none.out, /Nothing to write.*Next: \/gps plan/);
  assert.strictEqual(h.json(root, 'write-prepare.js').reason, 'plan-not-started');

  // Plan pending: header fields, sections and one ticket block.
  h.ok(root, 'plan.js');
  const plan = h.json(root, 'write-prepare.js');
  assert.strictEqual(plan.target, 'plan');
  assert.deepStrictEqual(plan.fields, ['Estimated effort']);
  assert.strictEqual(plan.branchPattern, undefined, 'no Branch without GitHub');
  assert.strictEqual(plan.ticketSeparator, '--- ticket: NN-<slug> ---');
  assert.match(plan.skeleton, /^\*\*Estimated effort:\*\* <!-- gps:fill/);
  assert.match(plan.skeleton, /\n--- ticket: 01-<slug> ---\n\n\*\*Model:\*\* <!-- gps:fill haiku \| sonnet \| opus \| inherit -->/);
  assert.match(h.ok(root, 'write-prepare.js').out, /Repeat the ticket block once per approved ticket/);

  // A payload left from an earlier run is flagged.
  fs.writeFileSync(plan.payloadPath, 'old');
  assert.strictEqual(h.json(root, 'write-prepare.js').existingPayload, true);
  assert.match(h.ok(root, 'write-prepare.js').out, /fix it in place/);

  // Records the phase's token-usage start.
  assert.ok(h.readConfig(root).usage.plan.startedAt);
}

{
  // resume.md deleted: the template's headings are still offered.
  const root = h.tempProject();
  h.ok(root, 'start.js', ['missing']);
  fs.unlinkSync(path.join(h.sessionDir(root), '01-grill', 'resume.md'));
  const prep = h.json(root, 'write-prepare.js');
  assert.strictEqual(prep.target, 'grill');
  assert.deepStrictEqual(prep.sections, GRILL_SECTIONS);
  h.assertFails(h.run(root, 'write-prepare.js', ['x']), 2);
}

h.done('write-prepare.test.js');
