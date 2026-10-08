// skills/gps/scripts/lib/changelog.js
//
// Pure text handling for CHANGELOG.md (no fs, no git): detect the file's
// format, parse the entry Claude writes (a session's fragment body, see
// changelog-fragments.js), read the hand-written Unreleased block, and render
// a release section from it and the fragments.

const { UsageError } = require('./guard');

const SECTIONS = ['Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security'];
const NEW_FILE_HEADER = '# Changelog\n\nAll notable changes to this project. Versions follow [semantic versioning](https://semver.org/).\n';
const VERSION_HEADING_RE = /^## +\[?v?(\d+\.\d+\.\d+)\]?(?=\s|$)/;

const UNRELEASED_RE = /^## +\[?Unreleased\]?\s*$/i;
const H2_RE = /^## /;
const H3_RE = /^### +(.+?)\s*$/;
const BULLET_RE = /^[-*] /;
const CONTINUATION_RE = /^ {2,}\S/;

function toLf(text) {
  return text.replace(/\r\n/g, '\n');
}

function detectFormat(text) {
  if (text === null || text.trim() === '') return 'new';
  const lines = toLf(text).split('\n');
  if (!lines.some((line) => /^# /.test(line))) return 'unknown';
  // A title with no entry yet (as /gps init creates it): the format is still open.
  if (!lines.some((line) => H2_RE.test(line) || BULLET_RE.test(line))) return 'new';
  let inH2 = false;
  for (const line of lines) {
    if (H2_RE.test(line)) inH2 = true;
    const h3 = inH2 && line.match(H3_RE);
    if (h3 && SECTIONS.includes(h3[1])) return 'sections';
  }
  return 'plain';
}

// Index range [start, end) of the Unreleased block: heading line included, up
// to the next "## " heading or the end.
function findUnreleased(lines) {
  const start = lines.findIndex((line) => UNRELEASED_RE.test(line));
  if (start === -1) return null;
  let end = lines.findIndex((line, i) => i > start && H2_RE.test(line));
  if (end === -1) end = lines.length;
  return { start, end };
}

function readUnreleased(text) {
  const lines = toLf(text || '').split('\n');
  const block = findUnreleased(lines);
  if (!block) return { exists: false, body: '' };
  return { exists: true, body: lines.slice(block.start + 1, block.end).join('\n').trim() };
}

function parsePayload(payload, format) {
  const withSections = format === 'sections';
  const bullets = [];
  const sections = {};
  let current = null;
  let target = null; // the list whose last bullet a continuation line extends

  for (const raw of toLf(payload).split('\n')) {
    const line = raw.trimEnd();
    if (line.trim() === '') continue;
    const heading = line.match(H3_RE);
    if (CONTINUATION_RE.test(line) && target && target.length) {
      target[target.length - 1] += `\n${line}`;
    } else if (heading) {
      target = null;
      if (!withSections) {
        throw new UsageError(`Unexpected "### ${heading[1]}": this CHANGELOG has no ### sections, so write plain "- " bullets only.`);
      }
      if (!SECTIONS.includes(heading[1])) {
        throw new UsageError(`Unknown section "### ${heading[1]}". Use one of: ${SECTIONS.join(', ')}.`);
      }
      current = sections[heading[1]] || (sections[heading[1]] = []);
    } else if (BULLET_RE.test(line)) {
      target = withSections ? current : bullets;
      if (!withSections) bullets.push(line);
      else if (current) current.push(line);
      else throw new UsageError('Bullet outside a "### <Section>" heading: this CHANGELOG uses sections, so put every bullet under one.');
    } else {
      throw new UsageError(`Unrecognised line "${line}": the entry is "- " bullets${withSections ? ' under ### headings' : ''}.`);
    }
  }

  if (withSections) {
    if (Object.values(sections).every((b) => b.length === 0)) throw new UsageError('The entry has no bullet.');
    return { sections };
  }
  if (bullets.length === 0) throw new UsageError('The entry has no bullet.');
  return { bullets };
}

function trimBlanks(lines) {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === '') start++;
  while (end > start && lines[end - 1].trim() === '') end--;
  return lines.slice(start, end);
}

function trimTrailingBlanks(lines) {
  let end = lines.length;
  while (end > 0 && lines[end - 1].trim() === '') end--;
  return lines.slice(0, end);
}

// Body of the Unreleased block as { preamble, subsections: [{ name, lines }] },
// every part without leading or trailing blank lines (the "### " heading line
// is the first of a subsection's lines).
function splitBody(body) {
  const parts = { preamble: [], subsections: [] };
  let target = parts.preamble;
  for (const line of body) {
    const h3 = line.match(H3_RE);
    if (h3) {
      const sub = { name: h3[1], lines: [line] };
      parts.subsections.push(sub);
      target = sub.lines;
    } else {
      target.push(line);
    }
  }
  parts.preamble = trimBlanks(parts.preamble);
  for (const sub of parts.subsections) sub.lines = trimBlanks(sub.lines);
  return parts;
}

// Merges a sections entry into `parts`, each bullet turned into its lines by
// `toLines`; a missing subsection is created in SECTIONS order.
function addSections(parts, sections, toLines) {
  for (const name of SECTIONS) {
    if (!sections[name]) continue;
    const added = sections[name].flatMap(toLines);
    const existing = parts.subsections.find((s) => s.name === name);
    if (existing) {
      existing.lines.push(...added);
      continue;
    }
    const sub = { name, lines: [`### ${name}`, '', ...added] };
    const next = parts.subsections.findIndex((s) => SECTIONS.indexOf(s.name) > SECTIONS.indexOf(name));
    parts.subsections.splice(next === -1 ? parts.subsections.length : next, 0, sub);
  }
}

function renderBody(parts) {
  const groups = [];
  if (parts.preamble.length) groups.push(parts.preamble);
  for (const sub of parts.subsections) groups.push(sub.lines);
  const out = [];
  groups.forEach((group, i) => {
    if (i > 0) out.push('');
    out.push(...group);
  });
  return out;
}

function unreleasedLines(text) {
  const lines = toLf(text || '').split('\n');
  const block = findUnreleased(lines);
  return block ? lines.slice(block.start + 1, block.end) : [];
}

function unreleasedHasEntries(text) {
  return unreleasedLines(text).some((line) => BULLET_RE.test(line));
}

function latestVersion(text) {
  for (const line of toLf(text || '').split('\n')) {
    const m = line.match(VERSION_HEADING_RE);
    if (m) return m[1];
  }
  return null;
}

// Section for a release: the hand-written Unreleased bullets first, then each
// fragment body in order, under "## <version> (<date>)". The Unreleased block
// is replaced; without one the section goes above the first version heading,
// else after the title. A body is merged into the file's format: a plain body
// under "### Changed" in a sections file, a sections body flattened (in
// SECTIONS order) into a plain file.
function renderRelease(text, version, date, bodies) {
  const isNew = text === null || text.trim() === '';
  const crlf = !isNew && text.includes('\r\n');
  const source = isNew ? NEW_FILE_HEADER : toLf(text);
  const trailingNewline = source.endsWith('\n');
  const hasSections = (body) => toLf(body).split('\n').some((line) => H3_RE.test(line));
  let format = detectFormat(text);
  if (format === 'new') format = bodies.some(hasSections) ? 'sections' : 'plain';

  const lines = source.split('\n');
  if (trailingNewline) lines.pop();
  const block = findUnreleased(lines);
  const parts = splitBody(block ? lines.slice(block.start + 1, block.end) : []);
  const lift = (bullet) => bullet.split('\n');

  for (const body of bodies) {
    const entry = parsePayload(body, hasSections(body) ? 'sections' : 'plain');
    if (format === 'sections') {
      addSections(parts, entry.sections || { Changed: entry.bullets }, lift);
    } else if (entry.sections) {
      parts.preamble.push(...SECTIONS.flatMap((name) => (entry.sections[name] || []).flatMap(lift)));
    } else {
      parts.preamble.push(...entry.bullets.flatMap(lift));
    }
  }

  let before;
  let rest;
  if (block) {
    before = lines.slice(0, block.start);
    rest = lines.slice(block.end);
  } else {
    const firstVersion = lines.findIndex((line) => VERSION_HEADING_RE.test(line));
    let at = lines.length;
    if (firstVersion !== -1) at = firstVersion;
    else if (!lines.some((line) => /^# /.test(line))) at = Math.min(1, lines.length);
    before = trimTrailingBlanks(lines.slice(0, at));
    if (before.length) before.push('');
    rest = trimBlanks(lines.slice(at));
  }
  const out = [
    ...before,
    `## ${version} (${date})`,
    '',
    ...renderBody(parts),
    ...(rest.length ? [''] : []),
    ...rest,
  ];
  const joined = out.join('\n') + (trailingNewline ? '\n' : '');
  return crlf ? joined.replace(/\n/g, '\r\n') : joined;
}

// Body of the "## <version> ..." section, up to the next "## ", trimmed.
function sectionNotes(text, version) {
  const lines = toLf(text || '').split('\n');
  const start = lines.findIndex((line) => {
    const m = line.match(VERSION_HEADING_RE);
    return m && m[1] === version;
  });
  if (start === -1) return '';
  let end = lines.findIndex((line, i) => i > start && H2_RE.test(line));
  if (end === -1) end = lines.length;
  return lines.slice(start + 1, end).join('\n').trim();
}

module.exports = {
  unreleasedHasEntries,
  latestVersion,
  renderRelease,
  sectionNotes,
  SECTIONS,
  NEW_FILE_HEADER,
  VERSION_HEADING_RE,
  detectFormat,
  readUnreleased,
  parsePayload,
};
