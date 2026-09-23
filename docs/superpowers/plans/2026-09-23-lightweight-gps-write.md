# Lightweight `/gps write` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/gps write` a 3-tool-call transcription step (write-target → one payload Write → write-apply), and split `skills/gps/SKILL.md` into a short router plus per-command reference files so a command only loads its own instructions.

**Architecture:** A new pure library `scripts/lib/write-payload.js` parses the single payload file and renders it into the phase's files. A thin handler `scripts/write-apply.js` validates, writes and cleans up; it replaces `scripts/mark-plan-written.js`, whose checks move into `lib/write-target.js` as `checkPlanWritten`. `SKILL.md` keeps the command table, shared rules and a routing instruction. Each command's section moves verbatim into `skills/gps/references/<command>.md`.

**Tech Stack:** Node.js (20/22), `fs`/`path` only, plain `assert` test scripts run by `node scripts/run-tests.js`.

**Spec:** `docs/superpowers/specs/2026-09-23-lightweight-gps-write-design.md`

## Global Constraints

- No external dependencies: handlers use only Node built-ins.
- Cross-platform: Windows (PowerShell), macOS, Linux. Payloads written on Windows may have CRLF line endings.
- Handlers go through `runCli` and throw `GpsError(message, hint)`. Output starts with `✅` on success and `❌` on failure.
- Never overwrite existing work: `write-apply.js` writes nothing unless every check passes and never deletes a ticket file other than a `[slug]` stub.
- Every `/gps` command is still typed `/gps <command>`. The `name` and `description` frontmatter of `skills/gps/SKILL.md` stay byte-identical.
- Tests are plain assert scripts. The whole suite passes via `node scripts/run-tests.js`.
- Version becomes `1.2.0` in `package.json`, `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`.

## Review Focus

1. **`## ` or `--- ticket:` inside a fenced code block** in a section or ticket body (e.g. a markdown sample in Notes): it must stay content and not start a new section or ticket. Test in Task 1.
2. **A CRLF payload** written on Windows must parse exactly like an LF one. Test in Task 1.
3. **A failed apply, then a fixed re-run:** the first run changes no file and keeps the payload; the second succeeds. Test in Task 3.
4. **A hand-written ticket left in `02-plan/tickets/`** from an earlier attempt: reported as an error, never deleted or overwritten. Test in Task 3.
5. **`resume.md` missing on disk** (deleted by hand): `write-target.js` still prints the template's section list, and `write-apply.js` recreates the file. Test in Task 2.

---

## File Structure

| File | Responsibility |
|---|---|
| `scripts/lib/write-payload.js` (new) | Parse the payload, validate it against expected headings, render the phase file, Token Usage section and ticket files. Pure except `loadPhaseFile` (reads disk/template). |
| `scripts/lib/write-payload.test.js` (new) | Unit tests for the above. |
| `scripts/lib/write-target.js` (modify) | Add `checkPlanWritten(sessionDir)` (the old `mark-plan-written.js` checks). |
| `scripts/write-target.js` (modify) | Also print `payloadPath`, `sections`, and `ticketSeparator` for plan. Stop printing `tokenUsage`. |
| `scripts/write-apply.js` (new) | Handler: validate the payload, write files, delete stubs and payload. |
| `scripts/mark-plan-written.js` (delete) | Replaced by `write-apply.js`. |
| `skills/gps/SKILL.md` (rewrite) | Router, about 45 lines. |
| `skills/gps/references/*.md` (new, 10 files) | One per command, moved from SKILL.md. |
| `scripts/handlers.test.js`, `scripts/e2e.test.js` (modify) | Use payloads; add write-apply and router guard tests. |
| `README.md`, `docs/TUTORIAL.md`, `CLAUDE.md` (modify) | Point to the new layout. |

---

### Task 1: Payload library

**Files:**
- Create: `scripts/lib/write-payload.js`
- Test: `scripts/lib/write-payload.test.js`

**Interfaces:**
- Consumes: `parseTicketFilename(fileName) -> { num, slug } | null` from `scripts/lib/ticket-queue.js`; `loadTemplate(fileName)`, `renderTemplate(content, vars)` from `scripts/lib/templates.js`.
- Produces (all exported):
  - `PAYLOAD_FILENAME = '.write-payload.md'`
  - `TOKEN_USAGE_HEADING = 'Token Usage'`
  - `splitSections(text) -> { preamble: string, sections: Array<{ heading: string, body: string }> }`
  - `parsePayload(text) -> { sections: Array<{ heading, body }>, tickets: Array<{ name, fileName, body }>, errors: string[] }`
  - `expectedHeadings(phaseFileText) -> string[]` (every `## ` heading except Token Usage, in order)
  - `validatePayload(payload, { expectedHeadings: string[], phase: 'grill'|'plan', isUnfilled: (text) => boolean }) -> string[]` (error messages; empty = valid)
  - `phaseFilePath(sessionDir, phase) -> string`
  - `loadPhaseFile(sessionDir, phase, config) -> string` (file on disk, or the rendered template if missing)
  - `renderTokenUsage(usage) -> string`
  - `renderPhaseFile(currentText, sections, usage) -> string`
  - `renderTicket(ticket) -> string`

- [ ] **Step 1: Write the failing tests**

Create `scripts/lib/write-payload.test.js`:

````js
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
````

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/lib/write-payload.test.js`
Expected: FAIL with `Cannot find module './write-payload'`

- [ ] **Step 3: Write the implementation**

Create `scripts/lib/write-payload.js`:

```js
// scripts/lib/write-payload.js
//
// /gps write has Claude put everything it writes into one payload file
// (<sessionDir>/.write-payload.md): a "## <heading>" block per section of
// the pending phase's file and, for the plan phase, one
// "--- ticket: NN-<slug> ---" block per ticket. This module parses that
// payload, checks it against the headings the phase file expects, and
// renders the phase file (with a generated Token Usage section) and the
// ticket files, so Claude never reads a template or copies token counts.

const fs = require('fs');
const path = require('path');
const { loadTemplate, renderTemplate } = require('./templates');
const { parseTicketFilename } = require('./ticket-queue');

const PAYLOAD_FILENAME = '.write-payload.md';
const TOKEN_USAGE_HEADING = 'Token Usage';

const HEADING_RE = /^## (.+?)\s*$/;
const TICKET_SEPARATOR_RE = /^--- ticket: (.*?) ---\s*$/;
const FENCE_RE = /^\s*(```|~~~)/;

const PHASE_FILES = {
  grill: { dir: '01-grill', file: 'resume.md', template: '01-grill-resume.md' },
  plan: { dir: '02-plan', file: 'plan.md', template: '02-plan.md' },
};

function toLines(text) {
  return text.replace(/\r\n/g, '\n').split('\n');
}

// Splits markdown into the text before the first "## " heading and one
// { heading, body } per heading. Headings inside fenced code blocks are
// content, not headings.
function splitSections(text) {
  const preamble = [];
  const sections = [];
  let current = null;
  let inFence = false;

  for (const line of toLines(text)) {
    if (FENCE_RE.test(line)) inFence = !inFence;
    const heading = !inFence && line.match(HEADING_RE);
    if (heading) {
      current = { heading: heading[1], lines: [] };
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
    } else {
      preamble.push(line);
    }
  }

  return {
    preamble: preamble.join('\n'),
    sections: sections.map((s) => ({ heading: s.heading, body: s.lines.join('\n').trim() })),
  };
}

// Everything before the first ticket separator is sections (text before
// the first heading is ignored); each separator starts a ticket whose body
// runs to the next separator. Separators inside fenced code are content.
function parsePayload(text) {
  const errors = [];
  const head = [];
  const tickets = [];
  let ticket = null;
  let inFence = false;

  for (const line of toLines(text)) {
    if (FENCE_RE.test(line)) inFence = !inFence;
    const separator = !inFence && line.match(TICKET_SEPARATOR_RE);
    if (separator) {
      const name = separator[1].trim();
      if (!parseTicketFilename(`${name}.md`)) {
        errors.push(`Invalid ticket name "${name}": use NN-<slug>, e.g. 01-add-parser.`);
      }
      ticket = { name, fileName: `${name}.md`, lines: [] };
      tickets.push(ticket);
    } else if (ticket) {
      ticket.lines.push(line);
    } else {
      head.push(line);
    }
  }

  return {
    sections: splitSections(head.join('\n')).sections,
    tickets: tickets.map((t) => ({ name: t.name, fileName: t.fileName, body: t.lines.join('\n').trim() })),
    errors,
  };
}

function expectedHeadings(phaseFileText) {
  return splitSections(phaseFileText).sections
    .map((s) => s.heading)
    .filter((heading) => heading !== TOKEN_USAGE_HEADING);
}

function validatePayload(payload, { expectedHeadings: expected, phase, isUnfilled }) {
  const errors = [...payload.errors];
  const seen = new Set();

  for (const { heading, body } of payload.sections) {
    if (heading === TOKEN_USAGE_HEADING) continue; // generated by write-apply.js
    if (!expected.includes(heading)) {
      errors.push(`Unknown section "## ${heading}". Expected: ${expected.join(', ')}.`);
      continue;
    }
    if (seen.has(heading)) errors.push(`Duplicate section "## ${heading}".`);
    seen.add(heading);
    if (!body) errors.push(`Section "## ${heading}" is empty.`);
    else if (isUnfilled(body)) errors.push(`Section "## ${heading}" still has a placeholder.`);
  }
  for (const heading of expected) {
    if (!seen.has(heading)) errors.push(`Missing section "## ${heading}".`);
  }

  if (phase === 'grill') {
    if (payload.tickets.length > 0) {
      errors.push('Ticket blocks are only allowed when writing the plan phase.');
    }
    return errors;
  }

  if (payload.tickets.length === 0) {
    errors.push('No tickets: add at least one "--- ticket: 01-<slug> ---" block.');
  }
  const names = new Set();
  for (const { name, body } of payload.tickets) {
    if (names.has(name)) errors.push(`Duplicate ticket "${name}".`);
    names.add(name);
    if (!body) errors.push(`Ticket "${name}" is empty.`);
    else if (isUnfilled(body)) errors.push(`Ticket "${name}" still has a placeholder.`);
  }
  return errors;
}

function phaseFilePath(sessionDir, phase) {
  const { dir, file } = PHASE_FILES[phase];
  return path.join(sessionDir, dir, file);
}

// The phase file as it is on disk, or freshly rendered from its template
// if it was deleted, so its headings and preamble are always available.
function loadPhaseFile(sessionDir, phase, config) {
  const filePath = phaseFilePath(sessionDir, phase);
  if (fs.existsSync(filePath)) return fs.readFileSync(filePath, 'utf-8');
  return renderTemplate(loadTemplate(PHASE_FILES[phase].template), {
    'feature-name': config.feature_name,
    timestamp: new Date().toISOString(),
  });
}

function renderTokenUsage(usage) {
  const value = (key) => (usage && usage.available ? String(usage[key]) : 'unavailable');
  return [
    `## ${TOKEN_USAGE_HEADING}`,
    '',
    `- **Input:** ${value('input')}`,
    `- **Output:** ${value('output')}`,
    `- **Cache read:** ${value('cacheRead')}`,
    `- **Cache creation:** ${value('cacheCreation')}`,
    `- **Total:** ${value('total')}`,
  ].join('\n');
}

// Keeps the current file's preamble (title, date) and heading order, puts
// each payload body under its heading, and appends a generated Token Usage.
function renderPhaseFile(currentText, sections, usage) {
  const { preamble, sections: current } = splitSections(currentText);
  const bodies = new Map(sections.map((s) => [s.heading, s.body]));
  const parts = [preamble.trim()];
  for (const { heading } of current) {
    if (heading === TOKEN_USAGE_HEADING) continue;
    parts.push(`## ${heading}\n\n${bodies.get(heading)}`);
  }
  parts.push(renderTokenUsage(usage));
  return `${parts.filter(Boolean).join('\n\n')}\n`;
}

function renderTicket(ticket) {
  const { num, slug } = parseTicketFilename(ticket.fileName);
  return `# Ticket ${num}: ${slug}\n\n${ticket.body}\n`;
}

module.exports = {
  PAYLOAD_FILENAME,
  TOKEN_USAGE_HEADING,
  splitSections,
  parsePayload,
  expectedHeadings,
  validatePayload,
  phaseFilePath,
  loadPhaseFile,
  renderTokenUsage,
  renderPhaseFile,
  renderTicket,
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node scripts/lib/write-payload.test.js`
Expected: `write-payload.test.js: all assertions passed`

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/write-payload.js scripts/lib/write-payload.test.js
git commit -m "feat(write): add payload parser and renderer for /gps write"
```

---

### Task 2: `write-target.js` prints the payload contract; `checkPlanWritten` moves into the lib

**Files:**
- Modify: `scripts/lib/write-target.js` (add `checkPlanWritten`, export it)
- Modify: `scripts/write-target.js`
- Test: `scripts/lib/write-target.test.js`, `scripts/handlers.test.js`

**Interfaces:**
- Consumes: `PAYLOAD_FILENAME`, `loadPhaseFile`, `expectedHeadings` from Task 1; `listTickets(sessionDir) -> { tickets, nextPending, skipped }` from `scripts/lib/ticket-queue.js`; `GpsError` from `scripts/lib/guard.js`.
- Produces:
  - `checkPlanWritten(sessionDir) -> { tickets, skipped }`. Throws `GpsError` if the grill isn't written, the plan isn't started, the plan still has placeholders or `[slug]` stubs, or there are no valid tickets.
  - `write-target.js` JSON, when a phase is pending: `{ sessionId, sessionDir, target, ..., payloadPath, sections: string[] }`, plus `ticketSeparator: '--- ticket: NN-<slug> ---'` for plan. There is no `tokenUsage` key any more.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/lib/write-target.test.js`, before any final `console.log` (add `checkPlanWritten` to the existing `require('./write-target')` destructuring at the top):

```js
// checkPlanWritten: the old mark-plan-written.js checks
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-check-plan-'));
  fs.writeFileSync(path.join(dir, '.session-config.json'), JSON.stringify({ template_version: 2 }));
  fs.mkdirSync(path.join(dir, '01-grill'), { recursive: true });
  fs.writeFileSync(path.join(dir, '01-grill', 'resume.md'), '<!-- gps:fill x -->');
  assert.throws(() => checkPlanWritten(dir), /grill phase is not written/);

  fs.writeFileSync(path.join(dir, '01-grill', 'resume.md'), 'done');
  assert.throws(() => checkPlanWritten(dir), /no plan yet/);

  const tickets = path.join(dir, '02-plan', 'tickets');
  fs.mkdirSync(tickets, { recursive: true });
  fs.writeFileSync(path.join(dir, '02-plan', 'plan.md'), 'done');
  fs.writeFileSync(path.join(tickets, '01-[slug].md'), 'stub');
  assert.throws(() => checkPlanWritten(dir), /not fully written/);

  fs.unlinkSync(path.join(tickets, '01-[slug].md'));
  assert.throws(() => checkPlanWritten(dir), /no valid ticket files/);

  fs.writeFileSync(path.join(tickets, '01-a.md'), 'real');
  fs.writeFileSync(path.join(tickets, 'notes.md'), 'real');
  const result = checkPlanWritten(dir);
  assert.deepStrictEqual(result.tickets.map((t) => t.slug), ['a']);
  assert.deepStrictEqual(result.skipped, ['notes.md']);
  fs.rmSync(dir, { recursive: true, force: true });
}
```

In `scripts/handlers.test.js`, add this block just before the final `console.log`:

```js
{
  // write-target prints the payload contract (and the template's headings if resume.md is gone)
  const root = tempProject();
  run(root, 'start-session.js', 'contract');
  const sessionDir = path.join(sessionsDir(root), currentSession(root));
  const grill = JSON.parse(run(root, 'write-target.js').out);
  assert.strictEqual(grill.target, 'grill');
  assert.strictEqual(grill.payloadPath, path.join(sessionDir, '.write-payload.md'));
  assert.deepStrictEqual(grill.sections, [
    'Problem Statement', 'Context & Constraints', 'Success Metrics', 'Architecture & Approach',
    'Assumptions & Trade-offs', 'Open Questions', 'Notes',
  ]);
  assert.strictEqual(grill.tokenUsage, undefined);
  assert.strictEqual(grill.ticketSeparator, undefined);

  fs.unlinkSync(path.join(sessionDir, '01-grill', 'resume.md'));
  const missing = JSON.parse(run(root, 'write-target.js').out);
  assert.strictEqual(missing.target, 'grill');
  assert.strictEqual(missing.sections.length, 7);
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node scripts/lib/write-target.test.js`
Expected: FAIL with `checkPlanWritten is not a function`

Run: `node scripts/handlers.test.js`
Expected: FAIL with an `AssertionError` on `grill.payloadPath` (actual `undefined`)

- [ ] **Step 3: Implement**

In `scripts/lib/write-target.js`, add to the top requires:

```js
const { listTickets } = require('./ticket-queue');
const { GpsError } = require('./guard');
```

Add before `module.exports`:

```js
// Verifies the plan phase is fully written: no placeholders, no [slug]
// stubs, at least one NN-<slug>.md ticket. Returns the tickets and any
// skipped (badly named) files; throws a GpsError listing what is missing.
function checkPlanWritten(sessionDir) {
  const writeTarget = resolveWriteTarget(sessionDir);
  if (writeTarget.target === 'grill') {
    throw new GpsError('The grill phase is not written yet.', 'Run /gps write for the grill phase first.');
  }
  if (writeTarget.reason === 'plan-not-started') {
    throw new GpsError('This session has no plan yet.', 'Run /gps plan first.');
  }
  if (writeTarget.target === 'plan') {
    throw new GpsError(
      `The plan is not fully written: plan.md or a ticket still has placeholders, or a [slug] stub remains (${writeTarget.existingStubs.join(', ') || 'no ticket files'}).`,
      'Fix the payload and run /gps write again.'
    );
  }

  const { tickets, skipped } = listTickets(sessionDir);
  if (tickets.length === 0) {
    throw new GpsError('The plan has no valid ticket files.', 'Write at least one 02-plan/tickets/NN-<slug>.md.');
  }
  return { tickets, skipped };
}
```

Change the export line to:

```js
module.exports = { TEMPLATE_VERSION, placeholderTester, resolveWriteTarget, checkPlanWritten };
```

Replace the body of `scripts/write-target.js` with:

```js
#!/usr/bin/env node

/**
 * /gps write, step 1
 *
 * Detects which phase (grill or plan) still needs its output written and,
 * when one is pending, prints where Claude writes the payload and which
 * "## " sections it must contain. write-apply.js then turns the payload
 * into the phase's files.
 */

const path = require('path');
const { resolveWriteTarget } = require('./lib/write-target');
const { resolveSession } = require('./lib/session-store');
const { touchPhase } = require('./lib/token-usage');
const { PAYLOAD_FILENAME, loadPhaseFile, expectedHeadings } = require('./lib/write-payload');
const { writeJsonAtomic, runCli } = require('./lib/guard');

runCli(() => {
  const { sessionId, sessionDir, configPath, config } = resolveSession(process.cwd());
  const result = resolveWriteTarget(sessionDir);

  if (result.target === 'grill' || result.target === 'plan') {
    touchPhase(config, result.target);
    writeJsonAtomic(configPath, config);
    result.payloadPath = path.join(sessionDir, PAYLOAD_FILENAME);
    result.sections = expectedHeadings(loadPhaseFile(sessionDir, result.target, config));
    if (result.target === 'plan') result.ticketSeparator = '--- ticket: NN-<slug> ---';
  }

  console.log(JSON.stringify({ sessionId, sessionDir, ...result }, null, 2));
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node scripts/lib/write-target.test.js && node scripts/handlers.test.js`
Expected: both print `all assertions passed`

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/write-target.js scripts/lib/write-target.test.js scripts/write-target.js scripts/handlers.test.js
git commit -m "feat(write): print payload path and sections from write-target"
```

---

### Task 3: `write-apply.js` replaces `mark-plan-written.js`

**Files:**
- Create: `scripts/write-apply.js`
- Delete: `scripts/mark-plan-written.js`
- Modify: `scripts/handlers.test.js` (the `writePlan` helper, the plan block at lines ~133-137, the F-010 list, new write-apply tests)
- Modify: `scripts/e2e.test.js` (both write steps)

**Interfaces:**
- Consumes: everything Task 1 exports; `resolveWriteTarget`, `placeholderTester`, `checkPlanWritten` from Task 2; `computeUsage(config, phaseKey)` from `scripts/lib/token-usage.js`; `resolveSession(cwd) -> { sessionId, sessionDir, configPath, config }`.
- Produces: CLI `node scripts/write-apply.js`. On success it prints `✅ Grill written for <id>. Next: /gps plan` or `✅ Plan written for <id>: <n> ticket(s). Next: /gps ship` and exits 0. On failure it prints `❌ …` plus a hint and exits 1.

- [ ] **Step 1: Write the failing tests**

In `scripts/handlers.test.js`:

1. Replace the `writePlan` helper (and its comment) with:

```js
const PLAN_SECTIONS = ['Strategy', 'Tickets Overview', 'Sequencing Rationale', 'Risks & Mitigation', 'Assumptions'];
const GRILL_SECTIONS = [
  'Problem Statement', 'Context & Constraints', 'Success Metrics', 'Architecture & Approach',
  'Assumptions & Trade-offs', 'Open Questions', 'Notes',
];

function payloadPath(root) {
  return path.join(sessionsDir(root), currentSession(root), '.write-payload.md');
}

function sectionsPayload(headings) {
  return headings.map((h) => `## ${h}\n\n${h} content.\n`).join('\n');
}

// Simulates the plan-phase /gps write: payload -> write-apply.js.
function writePlan(root, slugs) {
  const tickets = slugs
    .map((slug, i) => `--- ticket: ${String(i + 1).padStart(2, '0')}-${slug} ---\nDo ${slug}.\n`)
    .join('\n');
  fs.writeFileSync(payloadPath(root), `${sectionsPayload(PLAN_SECTIONS)}\n${tickets}`);
  const res = run(root, 'write-apply.js');
  assert.strictEqual(res.code, 0, res.err);
}
```

2. In the `plan` block, replace the `mark-plan-written refuses while stubs remain` lines with:

```js
  // write-apply refuses without a payload and changes nothing
  const notYet = run(root, 'write-apply.js');
  assert.strictEqual(notYet.code, 1);
  assert.match(notYet.err, /No payload at/);
```

3. In the F-010 list, replace `['mark-plan-written.js']` with `['write-apply.js']`.

4. Add before the final `console.log`:

```js
{
  // write-apply: grill phase
  const root = tempProject();
  run(root, 'start-session.js', 'applied');
  const sessionDir = path.join(sessionsDir(root), currentSession(root));
  const resume = path.join(sessionDir, '01-grill', 'resume.md');

  fs.writeFileSync(payloadPath(root), sectionsPayload(GRILL_SECTIONS).replace(/\n/g, '\r\n'));
  const res = run(root, 'write-apply.js');
  assert.strictEqual(res.code, 0, res.err);
  assert.match(res.out, /✅ Grill written for .*applied\. Next: \/gps plan/);
  const text = fs.readFileSync(resume, 'utf-8');
  assert.match(text, /^# Session: applied/);
  assert.match(text, /## Problem Statement\n\nProblem Statement content\./);
  assert.match(text, /- \*\*Total:\*\* unavailable/);
  assert.doesNotMatch(text, /gps:fill/);
  assert.ok(!fs.existsSync(payloadPath(root)));
  assert.strictEqual(JSON.parse(run(root, 'write-target.js').out).reason, 'plan-not-started');

  // nothing pending -> clear error
  const again = run(root, 'write-apply.js');
  assert.strictEqual(again.code, 1);
  assert.match(again.err, /Nothing to write/);
  assert.match(again.err, /\/gps plan/);
}

{
  // write-apply: a bad payload writes nothing and is kept; the fixed payload then succeeds
  const root = tempProject();
  run(root, 'start-session.js', 'retry');
  const sessionDir = path.join(sessionsDir(root), currentSession(root));
  const resume = path.join(sessionDir, '01-grill', 'resume.md');
  const before = fs.readFileSync(resume, 'utf-8');

  fs.writeFileSync(payloadPath(root), '## Problem Statement\n\nOnly one.\n## Bogus\n\nx\n');
  const bad = run(root, 'write-apply.js');
  assert.strictEqual(bad.code, 1);
  assert.match(bad.err, /nothing was written/);
  assert.match(bad.err, /Missing section "## Notes"/);
  assert.match(bad.err, /Unknown section "## Bogus"/);
  assert.doesNotMatch(bad.err, /\n\s+at /);
  assert.strictEqual(fs.readFileSync(resume, 'utf-8'), before);
  assert.ok(fs.existsSync(payloadPath(root)));

  fs.writeFileSync(payloadPath(root), sectionsPayload(GRILL_SECTIONS));
  assert.strictEqual(run(root, 'write-apply.js').code, 0);
}

{
  // write-apply: plan phase writes tickets, removes stubs, refuses leftover hand-written tickets
  const root = tempProject();
  run(root, 'start-session.js', 'planned-apply');
  writeResume(root);
  run(root, 'plan.js');
  const planDir = path.join(sessionsDir(root), currentSession(root), '02-plan');
  const ticketsDir = path.join(planDir, 'tickets');

  const leftover = path.join(ticketsDir, '07-old.md');
  fs.writeFileSync(leftover, '# Ticket 07: old\n\nHand-written.\n');
  fs.writeFileSync(payloadPath(root), `${sectionsPayload(PLAN_SECTIONS)}\n--- ticket: 01-a ---\nDo a.\n`);
  const refused = run(root, 'write-apply.js');
  assert.strictEqual(refused.code, 1);
  assert.match(refused.err, /07-old\.md already exists/);
  assert.strictEqual(fs.readFileSync(leftover, 'utf-8'), '# Ticket 07: old\n\nHand-written.\n');
  assert.ok(fs.readdirSync(ticketsDir).some((f) => f.includes('[slug]')), 'stubs must survive a refused run');

  fs.unlinkSync(leftover);
  writePlan(root, ['a', 'b']);
  assert.deepStrictEqual(fs.readdirSync(ticketsDir).sort(), ['01-a.md', '02-b.md']);
  assert.strictEqual(fs.readFileSync(path.join(ticketsDir, '01-a.md'), 'utf-8'), '# Ticket 01: a\n\nDo a.\n');
  const plan = fs.readFileSync(path.join(planDir, 'plan.md'), 'utf-8');
  assert.match(plan, /^# Implementation Plan/);
  assert.match(plan, /## Strategy\n\nStrategy content\./);
  assert.doesNotMatch(plan, /gps:fill/);
  assert.strictEqual(JSON.parse(run(root, 'ticket-queue.js').out).nextPending.slug, 'a');
}
```

In `scripts/e2e.test.js`, replace the `// write (grill)` block's direct `fs.writeFileSync(... resume.md ...)` line with:

```js
const grillTarget = JSON.parse(ok('write-target.js').out);
fs.writeFileSync(grillTarget.payloadPath, grillTarget.sections.map((h) => `## ${h}\n\n${h}: approved.\n`).join('\n'));
ok('write-apply.js');
```

(and delete the separate `assert.strictEqual(JSON.parse(ok('write-target.js').out).target, 'grill');` line above it, replacing it with `assert.strictEqual(grillTarget.target, 'grill');` after the new first line).

Replace everything in the `// write (plan)` block from `assert.strictEqual(JSON.parse(ok('write-target.js').out).target, 'plan');` through `ok('mark-plan-written.js');` with:

```js
const planTarget = JSON.parse(ok('write-target.js').out);
assert.strictEqual(planTarget.target, 'plan');
fs.writeFileSync(
  planTarget.payloadPath,
  planTarget.sections.map((h) => `## ${h}\n\n${h}: two tickets.\n`).join('\n') +
    '\n--- ticket: 01-toggle ---\nAdd the toggle.\n\n--- ticket: 02-persist ---\nPersist the choice.\n'
);
ok('write-apply.js');
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node scripts/handlers.test.js`
Expected: FAIL with an `AssertionError` from the plan block (`write-apply.js` doesn't exist, so `node` exits 1 with `Cannot find module` and the `/No payload at/` match fails)

- [ ] **Step 3: Implement `scripts/write-apply.js`**

```js
#!/usr/bin/env node

/**
 * /gps write, step 3
 *
 * Applies the payload Claude wrote to <sessionDir>/.write-payload.md:
 * checks it against the pending phase's headings, fills resume.md or
 * plan.md (with a generated Token Usage section), writes the plan's
 * NN-<slug>.md tickets and removes the [slug] stubs, then deletes the
 * payload. Writes nothing unless every check passes.
 */

const fs = require('fs');
const path = require('path');
const { resolveSession } = require('./lib/session-store');
const { resolveWriteTarget, placeholderTester, checkPlanWritten } = require('./lib/write-target');
const { computeUsage } = require('./lib/token-usage');
const {
  PAYLOAD_FILENAME,
  phaseFilePath,
  loadPhaseFile,
  expectedHeadings,
  parsePayload,
  validatePayload,
  renderPhaseFile,
  renderTicket,
} = require('./lib/write-payload');
const { GpsError, runCli } = require('./lib/guard');

const NOTHING_PENDING_HINT = {
  'plan-not-started': 'Run /gps plan first.',
  complete: 'Both phases are written. Run /gps status for the next command.',
};

runCli(() => {
  const { sessionId, sessionDir, config } = resolveSession(process.cwd());
  const { target, reason } = resolveWriteTarget(sessionDir);
  if (target === 'none') {
    throw new GpsError('Nothing to write for this session.', NOTHING_PENDING_HINT[reason]);
  }

  const payloadPath = path.join(sessionDir, PAYLOAD_FILENAME);
  if (!fs.existsSync(payloadPath)) {
    throw new GpsError(
      `No payload at ${payloadPath}.`,
      'Run write-target.js, write the payload to its payloadPath, then run this again.'
    );
  }

  const current = loadPhaseFile(sessionDir, target, config);
  const payload = parsePayload(fs.readFileSync(payloadPath, 'utf-8'));
  const errors = validatePayload(payload, {
    expectedHeadings: expectedHeadings(current),
    phase: target,
    isUnfilled: placeholderTester(sessionDir),
  });

  const ticketsDir = path.join(sessionDir, '02-plan', 'tickets');
  const stubs = [];
  if (target === 'plan' && fs.existsSync(ticketsDir)) {
    for (const fileName of fs.readdirSync(ticketsDir).filter((f) => f.endsWith('.md'))) {
      if (fileName.includes('[slug]')) stubs.push(fileName);
      else errors.push(`02-plan/tickets/${fileName} already exists. Move or delete it: only [slug] stubs are replaced.`);
    }
  }

  if (errors.length > 0) {
    throw new GpsError(
      `The payload is not ready (nothing was written):\n   - ${errors.join('\n   - ')}`,
      `Fix ${payloadPath} and run write-apply.js again.`
    );
  }

  const targetPath = phaseFilePath(sessionDir, target);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, renderPhaseFile(current, payload.sections, computeUsage(config, target)));

  if (target === 'grill') {
    if (resolveWriteTarget(sessionDir).target === 'grill') {
      throw new GpsError(`${targetPath} still has placeholders.`, 'Remove them by hand, then run /gps plan.');
    }
    fs.unlinkSync(payloadPath);
    console.log(`✅ Grill written for ${sessionId}. Next: /gps plan`);
    return;
  }

  fs.mkdirSync(ticketsDir, { recursive: true });
  for (const ticket of payload.tickets) {
    fs.writeFileSync(path.join(ticketsDir, ticket.fileName), renderTicket(ticket));
  }
  for (const stub of stubs) fs.unlinkSync(path.join(ticketsDir, stub));

  const { tickets, skipped } = checkPlanWritten(sessionDir);
  for (const fileName of skipped) {
    console.error(`⚠️  Skipped ${fileName}: ticket files must be named NN-<slug>.md`);
  }
  fs.unlinkSync(payloadPath);
  console.log(`✅ Plan written for ${sessionId}: ${tickets.length} ticket(s). Next: /gps ship`);
});
```

Then delete the old handler:

```bash
git rm scripts/mark-plan-written.js
```

- [ ] **Step 4: Run the whole suite**

Run: `node scripts/run-tests.js`
Expected: every file passes, exit code 0. Also run `grep -rn "mark-plan-written" scripts/` and confirm there are no matches.

- [ ] **Step 5: Commit**

```bash
git add scripts/write-apply.js scripts/handlers.test.js scripts/e2e.test.js
git commit -m "feat(write): apply /gps write payloads with write-apply.js

Replaces mark-plan-written.js: one payload in, resume/plan/tickets out,
Token Usage generated, stubs removed, nothing written on a bad payload."
```

---

### Task 4: Split SKILL.md into a router plus `references/<command>.md`

**Files:**
- Create: `skills/gps/references/{scout,start,status,handoff,resume,write,plan,ticket,ship,finish}.md`
- Rewrite: `skills/gps/SKILL.md`
- Test: `scripts/handlers.test.js`

**Interfaces:**
- Consumes: the current `skills/gps/SKILL.md` (as of commit `d119c9e`).
- Produces: `skills/gps/references/<command>.md` for each command in SKILL.md's table. Task 5 rewrites `write.md` and edits `start.md`.

- [ ] **Step 1: Write the failing guard test**

Add to `scripts/handlers.test.js`, before the final `console.log`:

```js
{
  // SKILL.md router: every command has a references file carrying its handler lines
  const skillDir = path.join(SCRIPTS, '..', 'skills', 'gps');
  const skill = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8');
  const listed = [...skill.matchAll(/^- `\/gps (\w+)/gm)].map((m) => m[1]).sort();
  const refsDir = path.join(skillDir, 'references');
  const files = fs.readdirSync(refsDir).map((f) => f.replace(/\.md$/, '')).sort();
  assert.deepStrictEqual(files, listed);

  const handlers = {
    scout: ['scout-merge.js'],
    start: ['start-session.js'],
    status: ['status.js'],
    handoff: ['handoff.js'],
    resume: ['resume.js'],
    write: ['write-target.js', 'write-apply.js'],
    plan: ['plan.js'],
    ticket: ['ticket.js'],
    ship: ['ticket-queue.js', 'ticket.js', 'token-usage.js'],
    finish: ['finish.js', 'set-current.js'],
  };
  assert.deepStrictEqual(Object.keys(handlers).sort(), listed);
  for (const [command, scripts] of Object.entries(handlers)) {
    const doc = fs.readFileSync(path.join(refsDir, `${command}.md`), 'utf-8');
    for (const script of scripts) {
      assert.ok(doc.includes(`node $CLAUDE_PLUGIN_ROOT/scripts/${script}`), `${command}.md must reference ${script}`);
    }
  }

  assert.ok(skill.includes('references/<command>.md'), 'SKILL.md must route to references/<command>.md');
  assert.ok(skill.split('\n').length <= 70, 'SKILL.md router must stay short');
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node scripts/handlers.test.js`
Expected: FAIL with `ENOENT` on `skills/gps/references`

- [ ] **Step 3: Move each command section verbatim**

Save this one-off script to the session scratchpad (not the repo) as `split-skill.js` and run it from the repo root with `node <scratchpad>/split-skill.js`:

```js
// One-off: moves every "### /gps <command>" section of SKILL.md into
// skills/gps/references/<command>.md, verbatim, with headings promoted
// one level. Leaves SKILL.md untouched (Step 5 rewrites it).
const fs = require('fs');
const path = require('path');

const skillPath = path.join('skills', 'gps', 'SKILL.md');
const refsDir = path.join('skills', 'gps', 'references');
const lines = fs.readFileSync(skillPath, 'utf-8').replace(/\r\n/g, '\n').split('\n');

const starts = [];
lines.forEach((line, i) => {
  const m = line.match(/^### \/gps (\w+)/);
  if (m) starts.push({ name: m[1], i });
});
const end = lines.findIndex((l) => l.startsWith('### Switching the current session'));
if (starts.length !== 10 || end === -1) throw new Error(`unexpected layout: ${starts.length} commands, end=${end}`);

fs.mkdirSync(refsDir, { recursive: true });
starts.forEach((s, k) => {
  const stop = k + 1 < starts.length ? starts[k + 1].i : end;
  const out = lines.slice(s.i, stop)
    .map((l) => l.replace(/^### /, '# ').replace(/^#### /, '## '))
    .join('\n')
    .replace(/\s*(?:---\s*)?$/, '\n');
  fs.writeFileSync(path.join(refsDir, `${s.name}.md`), out);
  console.log(`${s.name}.md: ${out.split('\n').length} lines`);
});
```

Expected output: 10 lines, one per file (`scout.md`, `start.md`, `status.md`, `handoff.md`, `resume.md`, `write.md`, `plan.md`, `ticket.md`, `ship.md`, `finish.md`). None of the files should end with `---`.

- [ ] **Step 4: Move each dependency into the command that invokes it**

Append to `skills/gps/references/scout.md`:

```markdown

## Dependency

The architecture review (plain `/gps scout` only): use the first skill available of `improve-codebase-architecture`, then `mattpocock-skills:codebase-design`. If neither is available, stop and tell the user to install the `mattpocock-skills` plugin.
```

Append to `skills/gps/references/start.md`:

```markdown

## Dependency

`brainstorming` (superpowers) runs the grill conversation. If it isn't available, stop and tell the user to install the `superpowers` plugin.
```

Append to `skills/gps/references/plan.md`:

```markdown

## Dependencies

- `writing-plans` (superpowers) turns the approved resume into tickets. If it isn't available, stop and tell the user to install the `superpowers` plugin.
- `unslop` runs on each generated ticket for crisp language. If it isn't available, skip that step and tell the user it was skipped.
```

- [ ] **Step 5: Rewrite `skills/gps/SKILL.md` as the router**

Replace the whole file with the following. Keep the frontmatter lines exactly as they are today.

```markdown
---
name: gps
description: "grill-plan-ship: universal workflow plugin (brainstorm → plan → implement). Use for /gps scout, /gps scout --from, /gps start, /gps status, /gps write, /gps plan, /gps ticket, /gps ship, /gps finish, /gps handoff, /gps resume."
---

# grill-plan-ship

Universal workflow plugin: brainstorm → plan → implement.

## How to run a command

Each command's full instructions live in `references/<command>.md` in this skill's directory (`/gps write` → `references/write.md`; `/gps scout --from …` → `references/scout.md`). Before doing anything else, read the file for the command you were given, and only that file. Never run a command from memory of an earlier read.

## Commands

- `/gps scout [--from <review-file>] [direction]` — Scan the codebase for architecture candidates, or read an existing review, and turn the result into ready-to-use `/gps start` seeds
- `/gps start <feature-name>` — Begin a new feature
- `/gps status` — Show every session's state, scouted ideas not started yet, and what's pending on the current one
- `/gps write` — Write the current phase's output (brainstorm resume, or plan + tickets) to disk
- `/gps plan` — Generate plan + tickets
- `/gps ticket <number>` — Implement ticket N
- `/gps ship` — Implement every remaining ticket in order, one commit each
- `/gps finish` — Close the session and write its summary
- `/gps handoff` — Save an in-flight checkpoint of the current session before stopping work
- `/gps resume` — Catch up on the current session using its saved handoff plus live state

## Workflow

Grill (brainstorm, clarify the spec) → Plan (atomic tickets) → Ship (implement tickets one by one) → Finish (close and summarize). An optional `/gps scout` sources feature candidates before Grill.

All output lives in `.work/sessions/YYYY-MM-DD__<slug>/` (local date; `<slug>` is the feature name cleaned to lowercase `a-z 0-9 . _ -`).

## Rules for every command

- Every command runs its handler script with the exact `node $CLAUDE_PLUGIN_ROOT/scripts/<name>.js` line given in its references file. **Never create, edit or delete session state by hand** (`.session-config.json`, `.current-session`, `.pending-seeds.json`, directories) to stand in for a handler.
- If a handler exits non-zero, it prints `❌ <what failed>` and a recovery hint on the next line. Show both to the user and stop that command — do not retry with different arguments or work around it.
- Handlers never overwrite existing work: re-running `/gps start`, `/gps plan`, `/gps ticket` or `/gps finish` against existing output either refuses (changing nothing) or resumes, as described per command.

## Switching the current session (internal, no `/gps` command)

`node $CLAUDE_PLUGIN_ROOT/scripts/set-current.js <session-id>` points `.work/sessions/.current-session` at an existing, unfinished session. Run it **only after the user confirms** a switch — after `/gps finish`, or when a handler reports that the current session can't be resolved.
```

The old Dependencies, Composable Skills, Installation, Update and Restart sections are gone. `README.md` already has the install lines but not the update line. In `README.md`, replace the line `Restart Claude Code.` under `## Installation` with:

````markdown
Restart Claude Code. To update later:

```
/plugin marketplace update rtonneau/grill-plan-ship
```
````

- [ ] **Step 6: Run the tests to check the split**

Run: `node scripts/handlers.test.js`
Expected: exactly one failure, `write.md must reference write-apply.js`. `write.md` still holds the old instructions until Task 5 rewrites it. Any other failure means a section was lost in the move: fix it before going on.

- [ ] **Step 7: Commit** (together with Task 5, so no commit has a failing suite; continue straight to Task 5)

---

### Task 5: Payload instructions in `references/write.md`, bounded path in `start.md`, docs

**Files:**
- Rewrite: `skills/gps/references/write.md`
- Modify: `skills/gps/references/start.md` (bounded-path bullet)
- Modify: `README.md`, `docs/TUTORIAL.md`, `CLAUDE.md`
- Test: `scripts/handlers.test.js` (write.md length guard)

**Interfaces:**
- Consumes: the `write-target.js` JSON contract from Task 2 (`target`, `reason`, `payloadPath`, `sections`, `ticketSeparator`) and the `write-apply.js` output from Task 3.
- Produces: final docs.

- [ ] **Step 1: Add the write.md length guard**

In the router guard block from Task 4, after the `SKILL.md router must stay short` line, add:

```js
  assert.ok(fs.readFileSync(path.join(refsDir, 'write.md'), 'utf-8').split('\n').length <= 50, 'write.md must stay short');
```

Run: `node scripts/handlers.test.js`
Expected: FAIL on `write.md must reference write-apply.js` (the length guard runs after it)

- [ ] **Step 2: Rewrite `skills/gps/references/write.md`**

Replace the whole file with:

`````markdown
# /gps write

**When:** After the brainstorming design `/gps start` began is approved (before `/gps plan`), or after the writing-plans output `/gps plan` began is approved (before `/gps ship`). Takes no arguments; it detects which phase needs writing.

**This is transcription, not design.** Copy what was already agreed in the conversation. Don't re-brainstorm, re-plan, read templates or explore the codebase.

**Steps:**

1. Run `node $CLAUDE_PLUGIN_ROOT/scripts/write-target.js`. Its JSON `target` is:
   - `none`: nothing to write. If `reason` is `plan-not-started`, suggest `/gps plan`. If it is `complete`, suggest `/gps status`. Stop.
   - `grill` or `plan`: continue with its `payloadPath` and `sections`.
2. Write the payload to `payloadPath` in a single Write call:
   - One `## <heading>` block per entry of `sections`, in that order, holding the agreed content. Leave out Token Usage; the script fills it.
   - **Plan only:** after the sections, one block per approved ticket, each opened by its own line `--- ticket: NN-<slug> ---` (e.g. `--- ticket: 01-add-parser ---`; the slug is lowercase `a-z 0-9` with `-`, `_` or `.` between). Ticket body:

     ````markdown
     **Acceptance Criteria:**
     - [ ] <testable criterion>

     **Files to Touch:**
     - `<path>`

     **Verification Step:**

     Run:
     ```bash
     <command>
     ```

     Expected:
     <output>

     **Notes:**

     <anything the implementer needs>
     ````
3. Run `node $CLAUDE_PLUGIN_ROOT/scripts/write-apply.js`. It checks the payload, writes `resume.md` or `plan.md` and the tickets, fills Token Usage, removes the stubs and deletes the payload.
   - `❌` with a list: nothing was written. Fix those items in the payload and run it again.
   - `✅`: relay its line; it names the next command.

**Example:**

```
/gps write
```
`````

- [ ] **Step 3: Point the bounded path in `start.md` at write.md**

In `skills/gps/references/start.md`, replace:

```markdown
- Once approved, and **before touching any code**, the agent must synthesize and save `01-grill/resume.md` using the same full-template process `/gps write` performs (all 7 sections) — every grill phase leaves a trace on disk, bounded or not.
```

with:

```markdown
- Once approved, and **before touching any code**, the agent must save `01-grill/resume.md` by following the steps in `references/write.md` (write-target → payload → write-apply) — every grill phase leaves a trace on disk, bounded or not.
```

- [ ] **Step 4: Update the docs**

`docs/TUTORIAL.md` line 3: replace `` and `skills/gps/SKILL.md` for the full command reference`` with `` and `skills/gps/references/<command>.md` for the full reference of each command``.

`docs/TUTORIAL.md` line 111: replace `` and `skills/gps/SKILL.md` for exact behavior of every command`` with `` and `skills/gps/references/` for exact behavior of every command``.

`CLAUDE.md`, architecture tree: replace

```
├── skills/gps/SKILL.md      ← Entry point (Claude Code reads this)
```

with

```
├── skills/gps/
│   ├── SKILL.md             ← Router: command table + shared rules (Claude Code loads this)
│   └── references/          ← One <command>.md per command, read on demand
```

and replace

```
│   ├── mark-plan-written.js ← Records plan phase complete after /gps write
```

with

```
│   ├── write-apply.js       ← Applies the /gps write payload (resume or plan + tickets)
```

and the `lib/` line's list `(session-store, templates, write-target, ticket-queue)` with `(session-store, templates, write-target, write-payload, ticket-queue)`.

`CLAUDE.md`, the `### SKILL.md` section under "Key Files to Edit": replace its two paragraphs with:

```markdown
Router. Lists the commands, the shared rules and where each command's instructions live. Claude Code loads it on every `/gps` call, so keep it short.

**Edit when:** Adding/renaming commands or changing a shared rule. Per-command behavior goes in `skills/gps/references/<command>.md`.
```

`CLAUDE.md`, "When working on SKILL.md": replace its bullets with:

```markdown
- Keep SKILL.md a router: command table, shared rules, routing line
- Put each command's details, handler line and example in `references/<command>.md`
- `scripts/handlers.test.js` checks every listed command has a references file with its handler lines
```

`README.md`: no change beyond the update line from Task 4 Step 5.

- [ ] **Step 5: Run the whole suite**

Run: `node scripts/run-tests.js`
Expected: all pass, exit code 0.

Run: `wc -l skills/gps/SKILL.md skills/gps/references/write.md`
Expected: SKILL.md ≤ 70 lines and write.md ≤ 50 lines, about 85 combined. The spec estimated about 60; the difference is the table and shared rules, which must stay.

- [ ] **Step 6: Commit Tasks 4 and 5 together**

```bash
git add skills/gps README.md docs/TUTORIAL.md CLAUDE.md scripts/handlers.test.js
git commit -m "docs(skill): split SKILL.md into a router and per-command references

/gps write now loads the router plus references/write.md instead of the
full 376-line SKILL.md, and documents the payload flow."
```

---

### Task 6: Bump the minor version to 1.2.0

**Files:**
- Modify: `package.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`

- [ ] **Step 1: Set the version**

In all three files, set `"version": "1.2.0"`. `package.json` currently says `1.1.0` and the two plugin files say `1.1.1`.

- [ ] **Step 2: Verify**

Run: `grep -n '"version"' package.json .claude-plugin/plugin.json .claude-plugin/marketplace.json`
Expected: three lines, each `"version": "1.2.0"`.

Run: `node scripts/run-tests.js`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add package.json .claude-plugin/plugin.json .claude-plugin/marketplace.json
git commit -m "chore: bump version to 1.2.0"
```
