// skills/gps/scripts/lib/changelog.js
//
// Pure text handling for CHANGELOG.md (no fs, no git): detect the file's
// format, parse the entry Claude writes, and keep one "Unreleased" entry per
// session. Every line gps writes carries a marker so a re-run replaces its own
// lines and leaves hand-written ones alone:
//   bullet:    "- text <!-- gps:<session-id> -->"
//   bump line: "<!-- gps:bump=<level> session=<session-id> -->"

const { LEVELS } = require('./semver');
const { UsageError } = require('./guard');

const SECTIONS = ['Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security'];
const NEW_FILE_HEADER = '# Changelog\n\nAll notable changes to this project. Versions follow [semantic versioning](https://semver.org/).\n';
const VERSION_HEADING_RE = /^## +\[?v?(\d+\.\d+\.\d+)\]?(?=\s|$)/;

const UNRELEASED_RE = /^## +\[?Unreleased\]?\s*$/i;
const H2_RE = /^## /;
const H3_RE = /^### +(.+?)\s*$/;
const BULLET_RE = /^[-*] /;
const CONTINUATION_RE = /^ {2,}\S/;
const BUMP_RE = /^<!-- gps:bump=\S+ session=(\S+) -->\s*$/;

function toLf(text) {
  return text.replace(/\r\n/g, '\n');
}

function detectFormat(text) {
  if (text === null || text.trim() === '') return 'new';
  const lines = toLf(text).split('\n');
  if (!lines.some((line) => /^# /.test(line))) return 'unknown';
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
  if (!block) return { exists: false, body: '', sessions: [] };
  const body = lines.slice(block.start + 1, block.end);
  const sessions = body.map((line) => line.match(BUMP_RE)).filter(Boolean).map((m) => m[1]);
  return { exists: true, body: body.join('\n').trim(), sessions };
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

function addSections(parts, sections, mark) {
  for (const name of SECTIONS) {
    if (!sections[name]) continue;
    const added = sections[name].flatMap(mark);
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

// Adds (or replaces) the session's entry in the Unreleased block, creating the
// file, the block and the subsections as needed. Everything else is untouched.
function upsertSessionEntry(text, { sessionId, bump, entry }) {
  if (!LEVELS.includes(bump)) throw new UsageError(`Unknown bump level "${bump}". Use one of: ${LEVELS.join(', ')}.`);
  const isNew = text === null || text.trim() === '';
  const crlf = !isNew && text.includes('\r\n');
  const source = isNew ? NEW_FILE_HEADER : toLf(text);
  const trailingNewline = source.endsWith('\n');
  const own = [`<!-- gps:${sessionId} -->`, `session=${sessionId} -->`];

  let lines = source.split('\n');
  if (trailingNewline) lines.pop();
  lines = lines.filter((line) => !own.some((marker) => line.includes(marker)));

  let block = findUnreleased(lines);
  if (!block) {
    const firstVersion = lines.findIndex((line) => VERSION_HEADING_RE.test(line));
    let at = lines.length;
    if (firstVersion !== -1) at = firstVersion;
    else if (!lines.some((line) => /^# /.test(line))) at = Math.min(1, lines.length);
    const before = trimTrailingBlanks(lines.slice(0, at));
    const rest = trimBlanks(lines.slice(at));
    const start = before.length + (before.length ? 1 : 0);
    lines = [...before, ...(before.length ? [''] : []), '## Unreleased', ...rest];
    // The new block is just its heading, whatever follows (an unknown structure).
    block = { start, end: start + 1 };
  }

  const inner = lines.slice(block.start + 1, block.end);
  const bumps = inner.filter((line) => BUMP_RE.test(line));
  const parts = splitBody(inner.filter((line) => !BUMP_RE.test(line)));
  const suffix = ` <!-- gps:${sessionId} -->`;
  // Every line of the entry carries the marker, so a re-run removes all of it.
  const mark = (bullet) => bullet.split('\n').map((l) => `${l}${suffix}`);
  // Removing the session's old bullets can leave a heading with nothing under it.
  parts.subsections = parts.subsections.filter((sub) => sub.lines.length > 1);

  if (entry.sections) addSections(parts, entry.sections, mark);
  else parts.preamble.push(...entry.bullets.flatMap(mark));
  bumps.push(`<!-- gps:bump=${bump} session=${sessionId} -->`);

  const rest = lines.slice(block.end);
  const out = [
    ...lines.slice(0, block.start + 1),
    '',
    ...renderBody(parts),
    ...bumps,
    ...(rest.length ? [''] : []),
    ...rest,
  ];
  const joined = out.join('\n') + (trailingNewline ? '\n' : '');
  return crlf ? joined.replace(/\n/g, '\r\n') : joined;
}

const BUMP_LEVEL_RE = /^<!-- gps:bump=(\S+) session=(\S+) -->\s*$/;
const MARKER_SUFFIX_RE = /\s*<!-- gps:.*? -->\s*$/;

function unreleasedLines(text) {
  const lines = toLf(text || '').split('\n');
  const block = findUnreleased(lines);
  return block ? lines.slice(block.start + 1, block.end) : [];
}

function allBumpMarkers(text) {
  return unreleasedLines(text)
    .map((line) => line.match(BUMP_LEVEL_RE))
    .filter(Boolean)
    .map((m) => ({ level: m[1], sessionId: m[2] }));
}

// The bump markers under Unreleased; a marker whose level is not one of
// LEVELS (a hand edit) is left out: unknownBumpLevels names those.
function readBumpMarkers(text) {
  return allBumpMarkers(text).filter((m) => LEVELS.includes(m.level));
}

// Distinct levels of the markers readBumpMarkers leaves out, in file order.
function unknownBumpLevels(text) {
  return [...new Set(allBumpMarkers(text).map((m) => m.level).filter((l) => !LEVELS.includes(l)))];
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

// Turns the Unreleased block into "## <version> (<date>)": gps markers go, and
// so do subsection headings left with no bullet. Other sections are untouched.
function cutRelease(text, version, date) {
  const crlf = text.includes('\r\n');
  const lines = toLf(text).split('\n');
  const trailingNewline = text.endsWith('\n');
  if (trailingNewline) lines.pop();
  const block = findUnreleased(lines);
  if (!block) throw new UsageError('No "## Unreleased" section in the CHANGELOG: nothing to release.');

  const inner = lines.slice(block.start + 1, block.end)
    .filter((line) => !BUMP_RE.test(line))
    .map((line) => line.replace(MARKER_SUFFIX_RE, ''));
  const parts = splitBody(inner);
  parts.subsections = parts.subsections.filter((sub) => sub.lines.length > 1);

  const rest = lines.slice(block.end);
  const out = [
    ...lines.slice(0, block.start),
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
  readBumpMarkers,
  unknownBumpLevels,
  unreleasedHasEntries,
  latestVersion,
  cutRelease,
  sectionNotes,
  SECTIONS,
  NEW_FILE_HEADER,
  VERSION_HEADING_RE,
  detectFormat,
  readUnreleased,
  parsePayload,
  upsertSessionEntry,
};
