// scripts/lib/guard.js
//
// Shared safety helpers for every handler: slug cleaning/validation,
// JSON read/write that never silently corrupts state, and a CLI wrapper
// that turns failures into a one-line "❌ message" + recovery hint
// instead of a stack trace.

const fs = require('fs');
const path = require('path');

const SLUG_RE = /^[a-z0-9]+([._-][a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 64;

class GpsError extends Error {
  constructor(message, hint) {
    super(message);
    this.name = 'GpsError';
    this.hint = hint || null;
  }
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

// YYYY-MM-DD in the machine's local timezone (not UTC).
function localDate(now = new Date()) {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function isSlug(value) {
  return typeof value === 'string' && value.length <= MAX_SLUG_LENGTH && SLUG_RE.test(value);
}

// Turns any feature name into a slug matching SLUG_RE: accents become
// plain letters, anything else invalid becomes "-", separator runs
// collapse, and the result is cut to MAX_SLUG_LENGTH at a separator.
// An empty result becomes "untitled-<local HHMMSS>".
function slugify(name, now = new Date()) {
  let slug = String(name || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/[._-]{2,}/g, (run) => (run.includes('-') ? '-' : run[0]))
    .replace(/^[._-]+|[._-]+$/g, '');

  if (slug.length > MAX_SLUG_LENGTH) {
    const cut = slug.slice(0, MAX_SLUG_LENGTH + 1);
    const lastSep = Math.max(cut.lastIndexOf('-'), cut.lastIndexOf('_'), cut.lastIndexOf('.'));
    slug = (lastSep > 0 ? cut.slice(0, lastSep) : cut.slice(0, MAX_SLUG_LENGTH))
      .replace(/[._-]+$/, '');
  }

  if (!slug) {
    slug = `untitled-${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
  }
  return slug;
}

// Reads and parses a JSON file, failing with a readable GpsError.
function readJson(filePath, label = path.basename(filePath)) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch (_err) {
    throw new GpsError(`${label} not found: ${filePath}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new GpsError(`${label} is not valid JSON (${err.message}): ${filePath}`,
      'Fix or restore the file by hand, then re-run the command.');
  }
}

// Writes JSON via a temp file + rename, so an interrupted write never
// leaves a half-written file in place.
function writeJsonAtomic(filePath, data) {
  const tmpPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  fs.renameSync(tmpPath, filePath);
}

// Runs a handler's main function; GpsErrors print "❌ message" (+ hint)
// and exit 1, anything else prints its message without a stack trace.
function runCli(main) {
  try {
    main();
  } catch (err) {
    if (err instanceof GpsError) {
      console.error(`❌ ${err.message}`);
      if (err.hint) console.error(`   ${err.hint}`);
    } else {
      console.error(`❌ Unexpected error: ${err && err.message ? err.message : err}`);
    }
    process.exit(1);
  }
}

module.exports = {
  SLUG_RE,
  MAX_SLUG_LENGTH,
  GpsError,
  localDate,
  isSlug,
  slugify,
  readJson,
  writeJsonAtomic,
  runCli,
};
