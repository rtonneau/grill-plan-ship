// skills/gps/scripts/lib/commit-log.js
//
// A ticket's 03-implement/NN-<slug>/commit-log.md. Claude fills the
// narrative sections (test result, review notes, blockers); the scripts
// own the rest: ticket-complete.js sets the Status line to Done and fills
// Commits and Time Spent; ticket-block.js records a blocker.

const { splitSections } = require('./write-payload');
const { toLines } = require('./guard');

const STATUS_RE = /^\*\*Status:\*\*.*$/m;
const STATUS_DONE = '**Status:** ✅ Done';
const BLOCKERS_HEADING = 'Blockers / Challenges';
// Filled by ticket-complete.js, whatever they hold (older logs have
// gps:fill markers there). Token Usage is only in logs from older versions,
// and ticket-complete.js removes it.
const SCRIPT_SECTIONS = ['Commits', 'Time Spent', 'Token Usage'];
const FILL_RE = /<!--\s*gps:fill\b/;

// Headings of the sections Claude still has to fill before completing.
function unfilledSections(text) {
  return splitSections(text).sections
    .filter((s) => !SCRIPT_SECTIONS.includes(s.heading) && (FILL_RE.test(s.body) || !s.body))
    .map((s) => s.heading);
}

// Replaces the body of `heading` (appending the section when it is
// missing); every other line is kept as is.
function setSection(text, heading, body) {
  const lines = toLines(text);
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start === -1) return `${text.trimEnd()}\n\n## ${heading}\n\n${body}\n`;
  let end = lines.findIndex((line, i) => i > start && /^## /.test(line));
  if (end === -1) end = lines.length;
  const tail = lines.slice(end);
  return [...lines.slice(0, start + 1), '', body, ...(tail.length > 0 ? ['', ...tail] : [''])].join('\n');
}

// The text without the "## <heading>" section, if it has one.
function removeSection(text, heading) {
  const lines = toLines(text);
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start === -1) return text;
  let end = lines.findIndex((line, i) => i > start && /^## /.test(line));
  if (end === -1) end = lines.length;
  return [...lines.slice(0, start), ...lines.slice(end)].join('\n');
}

function setStatus(text, statusLine) {
  return STATUS_RE.test(text) ? text.replace(STATUS_RE, statusLine) : `${statusLine}\n\n${text}`;
}

// "1h 05m" between two ISO timestamps, or null when either is unreadable.
function formatDuration(fromIso, toIso) {
  const ms = Date.parse(toIso) - Date.parse(fromIso);
  if (Number.isNaN(ms) || ms < 0) return null;
  const minutes = Math.round(ms / 60000);
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${String(minutes % 60).padStart(2, '0')}m` : `${minutes}m`;
}

// The log as ticket-complete.js leaves it.
function completeLog(text, { commits, startedAt, finishedAt }) {
  const spent = startedAt ? formatDuration(startedAt, finishedAt) : null;
  let out = setStatus(text, STATUS_DONE);
  out = setSection(out, 'Commits', commits.map((c) => `- ${c}`).join('\n'));
  out = setSection(out, 'Time Spent', spent ? `${spent} (ticket-start.js to ticket-complete.js)` : 'unknown (no ticket_started event)');
  out = removeSection(out, 'Token Usage');
  return `${out.trimEnd()}\n`;
}

// The log as ticket-block.js leaves it: still In Progress, reason recorded.
function blockLog(text, reason, at) {
  const current = splitSections(text).sections.find((s) => s.heading === BLOCKERS_HEADING);
  const kept = current && current.body && !FILL_RE.test(current.body) ? `${current.body}\n\n` : '';
  const out = setSection(setStatus(text, '**Status:** In Progress'), BLOCKERS_HEADING, `${kept}**Blocked (${at}):** ${reason}`);
  return `${out.trimEnd()}\n`;
}

// Short SHAs listed in the Commits section ("- <sha> <subject>").
function recordedCommits(text) {
  const section = splitSections(text).sections.find((s) => s.heading === 'Commits');
  if (!section) return [];
  return toLines(section.body).map((line) => line.match(/^- ([0-9a-f]{7,40})\b/)).filter(Boolean).map((m) => m[1]);
}

module.exports = { STATUS_DONE, unfilledSections, setSection, completeLog, blockLog, recordedCommits, formatDuration };
