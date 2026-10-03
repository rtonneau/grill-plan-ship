// skills/gps/scripts/lib/write-payload.js
//
// /gps write has Claude put everything it writes into one payload file
// (<sessionDir>/.write-payload.md): a "## <heading>" block per section of
// the pending phase's file and, for the plan phase, one
// "--- ticket: NN-<slug> ---" block per ticket. This module parses that
// payload, checks it against the headings the phase file expects, and
// renders the phase file and the
// ticket files, so Claude never reads a template.

const fs = require('fs');
const path = require('path');
const { loadTemplate, renderTemplate } = require('./templates');
const { parseTicketFilename } = require('./ticket-queue');
const { TICKET_MODELS, fenceTracker, normalizeTicketModel } = require('./ticket-model');
const { toLines } = require('./guard');

const PAYLOAD_FILENAME = '.write-payload.md';
// Older versions generated this section; it is dropped from phase files and
// payloads, never asked for.
const TOKEN_USAGE_HEADING = 'Token Usage';

const HEADING_RE = /^## (.+?)\s*$/;
const TICKET_SEPARATOR_RE = /^--- ticket: (.*?) ---\s*$/;
// "**Label:** value" lines above the first heading, e.g. "**Estimated effort:**".
const FIELD_RE = /^\*\*([^*]+?):\*\*\s*(.*)$/;
const UNFILLED_RE = /<!--\s*gps:fill\b|\{\{[^}]+\}\}/;

const PHASE_FILES = {
  grill: { dir: '01-grill', file: 'resume.md', template: '01-grill-resume.md' },
  plan: { dir: '02-plan', file: 'plan.md', template: '02-plan.md' },
};

// Placeholder error text; in pre-v2 sessions "{{ … }}" alone (e.g. Vue or
// Jinja code) also counts, which is worth saying since it looks legitimate.
function placeholderError(what, text) {
  const legacyOnly = !/<!--\s*gps:fill\b/.test(text);
  return `${what} still has a placeholder.${legacyOnly ? ' ({{ … }} counts as a placeholder in sessions created before template version 2.)' : ''}`;
}

// Splits markdown into the text before the first "## " heading and one
// { heading, body } per heading. Headings inside fenced code blocks are
// content, not headings.
function splitSections(text) {
  const preamble = [];
  const sections = [];
  let current = null;
  const fence = fenceTracker();

  for (const line of toLines(text)) {
    const heading = !fence.inCode(line) && line.match(HEADING_RE);
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
  const fence = fenceTracker();

  toLines(text).forEach((line, index) => {
    const separator = !fence.inCode(line, index + 1) && line.match(TICKET_SEPARATOR_RE);
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
  });

  // An unclosed fence would silently swallow every later ticket.
  if (fence.open) {
    const { char, length, lineNumber } = fence.open;
    errors.push(`Unclosed code fence opened at payload line ${lineNumber}: close it with ${char.repeat(length)}.`);
  }

  const { preamble, sections } = splitSections(head.join('\n'));
  return {
    sections,
    fields: parseFields(preamble),
    tickets: tickets.map((t) => ({ name: t.name, fileName: t.fileName, body: t.lines.join('\n').trim() })),
    errors,
  };
}

function parseFields(preamble) {
  const fields = {};
  for (const line of toLines(preamble)) {
    const match = line.match(FIELD_RE);
    if (match) fields[match[1]] = match[2].trim();
  }
  return fields;
}

// Labels of the header fields the phase file still leaves unfilled.
function expectedFields(phaseFileText) {
  return toLines(splitSections(phaseFileText).preamble)
    .map((line) => line.match(FIELD_RE))
    .filter((match) => match && UNFILLED_RE.test(match[2]))
    .map((match) => match[1]);
}

function expectedHeadings(phaseFileText) {
  return splitSections(phaseFileText).sections
    .map((s) => s.heading)
    .filter((heading) => heading !== TOKEN_USAGE_HEADING);
}

function validatePayload(payload, { expectedHeadings: expected, expectedFields: fields = [], phase, isUnfilled }) {
  const errors = [...payload.errors];

  for (const label of fields) {
    const value = payload.fields[label];
    if (!value) errors.push(`Missing field "**${label}:**": put it on its own line before the first ## heading.`);
    else if (isUnfilled(value)) errors.push(placeholderError(`Field "**${label}:**"`, value));
  }
  const seen = new Set();

  for (const { heading, body } of payload.sections) {
    if (heading === TOKEN_USAGE_HEADING) continue; // left by an older version
    if (!expected.includes(heading)) {
      errors.push(`Unknown section "## ${heading}". Expected: ${expected.join(', ')}.`);
      continue;
    }
    if (seen.has(heading)) errors.push(`Duplicate section "## ${heading}".`);
    seen.add(heading);
    if (!body) errors.push(`Section "## ${heading}" is empty.`);
    else if (isUnfilled(body)) errors.push(placeholderError(`Section "## ${heading}"`, body));
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
    else if (isUnfilled(body)) errors.push(placeholderError(`Ticket "${name}"`, body));
    const { model, raw } = normalizeTicketModel(body);
    if (raw === '') {
      errors.push(`Ticket "${name}" has an empty **Model:** line. Give one of: ${TICKET_MODELS.join(', ')}, or remove the line.`);
    } else if (raw !== null && raw.toLowerCase() !== model) {
      errors.push(`Ticket "${name}" has unknown model "${raw}". Use one of: ${TICKET_MODELS.join(', ')}.`);
    }
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

// Keeps the current file's preamble (title, date) with its header fields
// filled in, keeps its heading order, puts each payload body under its
// heading, and drops a Token Usage section an older version generated.
function renderPhaseFile(currentText, sections, fields = {}) {
  const { preamble, sections: current } = splitSections(currentText);
  const bodies = new Map(sections.map((s) => [s.heading, s.body]));
  const header = toLines(preamble).map((line) => {
    const match = line.match(FIELD_RE);
    const expected = match && UNFILLED_RE.test(match[2]);
    return expected && fields[match[1]] ? `**${match[1]}:** ${fields[match[1]]}` : line;
  });
  const parts = [header.join('\n').trim()];
  for (const { heading } of current) {
    if (heading === TOKEN_USAGE_HEADING) continue;
    parts.push(`## ${heading}\n\n${bodies.get(heading)}`);
  }
  return `${parts.filter(Boolean).join('\n\n')}\n`;
}

// The payload for `phase` with every gap marked: the phase file's unfilled
// header fields (after `extraFields`, e.g. the Branch line), its sections
// with their fill hints, and for the plan one ticket block to repeat per
// ticket. Claude replaces the markers; write-apply.js rejects any left.
function buildSkeleton(phaseFileText, phase, extraFields = []) {
  const { preamble, sections } = splitSections(phaseFileText);
  const fields = toLines(preamble).filter((line) => {
    const match = line.match(FIELD_RE);
    return match && UNFILLED_RE.test(match[2]);
  });
  const parts = [[...extraFields, ...fields].join('\n')];
  for (const { heading, body } of sections) {
    if (heading !== TOKEN_USAGE_HEADING) parts.push(`## ${heading}\n\n${body}`);
  }
  if (phase === 'plan') parts.push(`--- ticket: 01-<slug> ---\n\n${loadTemplate('02-ticket.md').trim()}`);
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
  expectedFields,
  validatePayload,
  phaseFilePath,
  loadPhaseFile,
  renderPhaseFile,
  buildSkeleton,
  renderTicket,
};
