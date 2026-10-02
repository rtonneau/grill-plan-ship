// skills/gps/scripts/lib/guard.js
//
// Shared helpers for every script: the error types the CLI contract maps
// to exit codes (see cli.js), slug cleaning/validation, dates, and JSON
// read/write that never silently corrupts state.

const fs = require('fs');
const path = require('path');

const SLUG_RE = /^[a-z0-9]+([._-][a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 64;
const DAY_MS = 24 * 60 * 60 * 1000;

// A failed precondition or validation: exit 1, "❌ message" + hint.
class GpsError extends Error {
  constructor(message, hint) {
    super(message);
    this.name = 'GpsError';
    this.hint = hint || null;
  }
}

// Bad arguments: exit 2; the hint defaults to the script's usage line.
class UsageError extends GpsError {
  constructor(message, hint) {
    super(message, hint);
    this.name = 'UsageError';
  }
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

// YYYY-MM-DD in the machine's local timezone (not UTC).
function localDate(now = new Date()) {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

// Whole days from an ISO timestamp to `now`, or null when it is unreadable.
function daysSince(iso, now = new Date()) {
  const time = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(time) ? null : Math.max(0, Math.floor((now.getTime() - time) / DAY_MS));
}

// Text as lines: BOM dropped, CRLF normalized.
function toLines(text) {
  return String(text).replace(/^﻿/, '').replace(/\r\n/g, '\n').split('\n');
}

// Text safe inside a markdown table cell (pipes escaped, one line).
function mdCell(text) {
  return String(text === null || text === undefined ? '' : text).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
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

// The parsed JSON file, or null when it is missing or unreadable.
function readJsonOrNull(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (_err) {
    return null;
  }
}

// Writes JSON via a temp file + rename, so an interrupted write never
// leaves a half-written file in place.
function writeJsonAtomic(filePath, data) {
  const tmpPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  fs.renameSync(tmpPath, filePath);
}

module.exports = {
  SLUG_RE,
  MAX_SLUG_LENGTH,
  GpsError,
  UsageError,
  pad2,
  localDate,
  daysSince,
  toLines,
  mdCell,
  isSlug,
  slugify,
  readJson,
  readJsonOrNull,
  writeJsonAtomic,
};
