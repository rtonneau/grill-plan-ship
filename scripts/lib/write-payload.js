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
const FENCE_OPEN_RE = /^\s*(`{3,}|~{3,})/;
const FENCE_CLOSE_RE = /^\s*(`{3,}|~{3,})\s*$/;
// "**Label:** value" lines above the first heading, e.g. "**Estimated effort:**".
const FIELD_RE = /^\*\*([^*]+?):\*\*\s*(.*)$/;
const UNFILLED_RE = /<!--\s*gps:fill\b|\{\{[^}]+\}\}/;

const PHASE_FILES = {
  grill: { dir: '01-grill', file: 'resume.md', template: '01-grill-resume.md' },
  plan: { dir: '02-plan', file: 'plan.md', template: '02-plan.md' },
};

function toLines(text) {
  return text.replace(/\r\n/g, '\n').split('\n');
}

// Tracks fenced code blocks the CommonMark way: a fence closes only on a
// bare line of the same character, at least as long as the opening one,
// so "~~~" inside a ``` block or ``` inside a ```` block stays content.
function fenceTracker() {
  let open = null;
  return {
    // True when the line is a fence line or inside a fenced block.
    inCode(line, lineNumber) {
      if (open) {
        const close = line.match(FENCE_CLOSE_RE);
        if (close && close[1][0] === open.char && close[1].length >= open.length) open = null;
        return true;
      }
      const start = line.match(FENCE_OPEN_RE);
      if (start) open = { char: start[1][0], length: start[1].length, lineNumber };
      return Boolean(start);
    },
    get open() {
      return open;
    },
  };
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
    else if (isUnfilled(value)) errors.push(`Field "**${label}:**" still has a placeholder.`);
  }
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

// Keeps the current file's preamble (title, date) with its header fields
// filled in, keeps its heading order, puts each payload body under its
// heading, and appends a generated Token Usage.
function renderPhaseFile(currentText, sections, usage, fields = {}) {
  const { preamble, sections: current } = splitSections(currentText);
  const bodies = new Map(sections.map((s) => [s.heading, s.body]));
  const header = toLines(preamble).map((line) => {
    const match = line.match(FIELD_RE);
    return match && fields[match[1]] ? `**${match[1]}:** ${fields[match[1]]}` : line;
  });
  const parts = [header.join('\n').trim()];
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
  expectedFields,
  validatePayload,
  phaseFilePath,
  loadPhaseFile,
  renderTokenUsage,
  renderPhaseFile,
  renderTicket,
};
