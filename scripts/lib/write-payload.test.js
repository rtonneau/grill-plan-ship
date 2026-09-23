// scripts/lib/write-payload.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  PAYLOAD_FILENAME,
  splitSections,
  parsePayload,
  expectedHeadings,
  expectedFields,
  validatePayload,
  phaseFilePath,
  loadPhaseFile,
  renderTokenUsage,
  renderPhaseFile,
  renderTicket,
} = require('./write-payload');

const FILL_RE = /<!--\s*gps:fill\b/;
const isUnfilled = (text) => FILL_RE.test(text);
const legacyUnfilled = (text) => FILL_RE.test(text) || /\{\{[^}]+\}\}/.test(text);

assert.strictEqual(PAYLOAD_FILENAME, '.write-payload.md');

// splitSections: preamble + sections, fence-aware
{
  const text = '# Title\n\n**Date:** x\n\n## A\n\nalpha\n\n## B\n\n```md\n## not a heading\n```\n';
  const { preamble, sections } = splitSections(text);
  assert.strictEqual(preamble.trim(), '# Title\n\n**Date:** x');
  assert.deepStrictEqual(sections.map((s) => s.heading), ['A', 'B']);
  assert.strictEqual(sections[0].body, 'alpha');
  assert.strictEqual(sections[1].body, '```md\n## not a heading\n```');
}

// expectedHeadings drops Token Usage
assert.deepStrictEqual(
  expectedHeadings('# T\n\n## Strategy\n\nx\n\n## Token Usage\n\n- n\n'),
  ['Strategy']
);

// parsePayload: plan sections + tickets
const PLAN_PAYLOAD = [
  'Some chatter before the first heading.',
  '## Strategy',
  'Do it in order.',
  '## Assumptions',
  'None.',
  '',
  '--- ticket: 01-add-parser ---',
  '**Acceptance Criteria:**',
  '- [ ] parses',
  '```md',
  '## Example heading inside a fence',
  '--- ticket: 99-not-a-ticket ---',
  '```',
  '--- ticket: 02-wire-cli ---',
  'Wire it.',
  '',
].join('\n');
{
  const p = parsePayload(PLAN_PAYLOAD);
  assert.deepStrictEqual(p.errors, []);
  assert.deepStrictEqual(p.sections, [
    { heading: 'Strategy', body: 'Do it in order.' },
    { heading: 'Assumptions', body: 'None.' },
  ]);
  assert.deepStrictEqual(p.tickets.map((t) => t.fileName), ['01-add-parser.md', '02-wire-cli.md']);
  assert.match(p.tickets[0].body, /## Example heading inside a fence\n--- ticket: 99-not-a-ticket ---/);
  assert.strictEqual(p.tickets[1].body, 'Wire it.');

  // CRLF parses the same
  assert.deepStrictEqual(parsePayload(PLAN_PAYLOAD.replace(/\n/g, '\r\n')), p);
}

// Fences: an unclosed fence is an error; mixed or longer fences don't close early
{
  const unclosed = parsePayload('## Strategy\nx\n--- ticket: 01-a ---\n```bash\nrun\n--- ticket: 02-b ---\nDo b.\n');
  assert.ok(unclosed.errors.some((e) => /Unclosed code fence opened at payload line 4/.test(e)), unclosed.errors);

  const mixed = parsePayload('--- ticket: 01-a ---\n```\n~~~\n--- ticket: 02-b ---\n```\n--- ticket: 03-c ---\nc\n');
  assert.deepStrictEqual(mixed.tickets.map((t) => t.name), ['01-a', '03-c']);
  assert.deepStrictEqual(mixed.errors, []);

  const nested = splitSections('## A\n````md\n```\n## inside\n```\n````\n## B\nb\n');
  assert.deepStrictEqual(nested.sections.map((s) => s.heading), ['A', 'B']);
}

// parsePayload: invalid ticket name
{
  const p = parsePayload('## Strategy\nx\n--- ticket: Add Parser ---\nbody\n');
  assert.strictEqual(p.errors.length, 1);
  assert.match(p.errors[0], /Invalid ticket name "Add Parser"/);
}

// validatePayload: grill
const GRILL_HEADINGS = ['Problem Statement', 'Notes'];
{
  const ok = parsePayload('## Problem Statement\nBroken.\n## Notes\nNone.\n');
  assert.deepStrictEqual(validatePayload(ok, { expectedHeadings: GRILL_HEADINGS, phase: 'grill', isUnfilled }), []);

  // Token Usage in the payload is ignored, not an error
  const withUsage = parsePayload('## Problem Statement\nBroken.\n## Notes\nNone.\n## Token Usage\n- 5\n');
  assert.deepStrictEqual(validatePayload(withUsage, { expectedHeadings: GRILL_HEADINGS, phase: 'grill', isUnfilled }), []);

  const bad = parsePayload('## Problem Statement\n<!-- gps:fill What? -->\n## Problem Statement\nagain\n## Extra\nx\n## Empty\n\n--- ticket: 01-x ---\nt\n');
  const errors = validatePayload(bad, { expectedHeadings: [...GRILL_HEADINGS, 'Empty'], phase: 'grill', isUnfilled });
  assert.ok(errors.some((e) => /"## Problem Statement" still has a placeholder/.test(e)), errors);
  assert.ok(errors.some((e) => /Duplicate section "## Problem Statement"/.test(e)), errors);
  assert.ok(errors.some((e) => /Unknown section "## Extra"/.test(e)), errors);
  assert.ok(errors.some((e) => /"## Empty" is empty/.test(e)), errors);
  assert.ok(errors.some((e) => /Missing section "## Notes"/.test(e)), errors);
  assert.ok(errors.some((e) => /only allowed when writing the plan/.test(e)), errors);
}

// validatePayload: plan
{
  const headings = ['Strategy', 'Assumptions'];
  assert.deepStrictEqual(validatePayload(parsePayload(PLAN_PAYLOAD), { expectedHeadings: headings, phase: 'plan', isUnfilled }), []);

  const none = validatePayload(parsePayload('## Strategy\nx\n## Assumptions\ny\n'), { expectedHeadings: headings, phase: 'plan', isUnfilled });
  assert.ok(none.some((e) => /No tickets/.test(e)), none);

  const dup = validatePayload(
    parsePayload('## Strategy\nx\n## Assumptions\ny\n--- ticket: 01-a ---\nt\n--- ticket: 01-a ---\nt\n--- ticket: 02-b ---\n\n'),
    { expectedHeadings: headings, phase: 'plan', isUnfilled }
  );
  assert.ok(dup.some((e) => /Duplicate ticket "01-a"/.test(e)), dup);
  assert.ok(dup.some((e) => /Ticket "02-b" is empty/.test(e)), dup);

  // legacy session: {{ }} counts as a placeholder
  const legacy = validatePayload(
    parsePayload('## Strategy\n{{ approach }}\n## Assumptions\ny\n--- ticket: 01-a ---\nt\n'),
    { expectedHeadings: headings, phase: 'plan', isUnfilled: legacyUnfilled }
  );
  assert.ok(legacy.some((e) => /"## Strategy" still has a placeholder/.test(e)), legacy);
}

// renderTokenUsage
assert.strictEqual(
  renderTokenUsage({ available: true, input: 1, output: 2, cacheRead: 3, cacheCreation: 4, total: 10 }),
  '## Token Usage\n\n- **Input:** 1\n- **Output:** 2\n- **Cache read:** 3\n- **Cache creation:** 4\n- **Total:** 10'
);
assert.match(renderTokenUsage({ available: false }), /- \*\*Input:\*\* unavailable\n[\s\S]*- \*\*Total:\*\* unavailable$/);

// renderPhaseFile keeps the preamble and on-disk order, regenerates Token Usage
{
  const current = '# Plan\n\n**Date:** d\n\n## Strategy\n\n<!-- gps:fill -->\n\n## Assumptions\n\n<!-- gps:fill -->\n\n## Token Usage\n\n- **Input:** <!-- gps:fill -->\n';
  const out = renderPhaseFile(
    current,
    [{ heading: 'Assumptions', body: 'None.' }, { heading: 'Strategy', body: 'Order.' }],
    { available: false }
  );
  assert.strictEqual(
    out,
    '# Plan\n\n**Date:** d\n\n## Strategy\n\nOrder.\n\n## Assumptions\n\nNone.\n\n' +
      '## Token Usage\n\n- **Input:** unavailable\n- **Output:** unavailable\n- **Cache read:** unavailable\n- **Cache creation:** unavailable\n- **Total:** unavailable\n'
  );
  assert.ok(!isUnfilled(out));
}

// Header fields: "**Label:** <!-- gps:fill -->" lines above the first heading
{
  const current = '# Plan\n\n**Session:** demo\n**Estimated effort:** <!-- gps:fill N hours/days -->\n\n## Strategy\n\n<!-- gps:fill -->\n';
  assert.deepStrictEqual(expectedFields(current), ['Estimated effort']);
  assert.deepStrictEqual(expectedFields('# Resume\n\n**Date:** d\n\n## A\n'), []);

  const payload = parsePayload('**Estimated effort:** 2 days\n\n## Strategy\nOrder.\n--- ticket: 01-a ---\nt\n');
  assert.deepStrictEqual(payload.fields, { 'Estimated effort': '2 days' });
  const opts = { expectedHeadings: ['Strategy'], expectedFields: ['Estimated effort'], phase: 'plan', isUnfilled };
  assert.deepStrictEqual(validatePayload(payload, opts), []);

  const missing = validatePayload(parsePayload('## Strategy\nOrder.\n--- ticket: 01-a ---\nt\n'), opts);
  assert.ok(missing.some((e) => /Missing field "\*\*Estimated effort:\*\*"/.test(e)), missing);

  const out = renderPhaseFile(current, payload.sections, { available: false }, payload.fields);
  assert.match(out, /^# Plan\n\n\*\*Session:\*\* demo\n\*\*Estimated effort:\*\* 2 days\n\n## Strategy\n\nOrder\./);
  assert.ok(!isUnfilled(out));
}

// renderTicket
assert.strictEqual(
  renderTicket({ name: '01-add-parser', fileName: '01-add-parser.md', body: 'Do it.' }),
  '# Ticket 01: add-parser\n\nDo it.\n'
);

// phaseFilePath + loadPhaseFile (disk, then template fallback)
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-write-payload-'));
  assert.strictEqual(phaseFilePath(dir, 'grill'), path.join(dir, '01-grill', 'resume.md'));
  assert.strictEqual(phaseFilePath(dir, 'plan'), path.join(dir, '02-plan', 'plan.md'));

  const fromTemplate = loadPhaseFile(dir, 'grill', { feature_name: 'demo' });
  assert.match(fromTemplate, /^# Session: demo/);
  assert.deepStrictEqual(expectedHeadings(fromTemplate), [
    'Problem Statement', 'Context & Constraints', 'Success Metrics', 'Architecture & Approach',
    'Assumptions & Trade-offs', 'Open Questions', 'Notes',
  ]);

  fs.mkdirSync(path.join(dir, '01-grill'));
  fs.writeFileSync(phaseFilePath(dir, 'grill'), '# Mine\n\n## Only\n\nx\n');
  assert.deepStrictEqual(expectedHeadings(loadPhaseFile(dir, 'grill', { feature_name: 'demo' })), ['Only']);
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('write-payload.test.js: all assertions passed');
