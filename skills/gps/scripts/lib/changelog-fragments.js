// skills/gps/scripts/lib/changelog-fragments.js
//
// Per-session changelog fragments: .work/changelog/<session-id>.md holds a
// `---` fenced front matter (bump, floor, optional single-line reason) and the
// changelog payload as body. /gps finish writes one; /gps release merges them.

const fs = require('fs');
const path = require('path');
const { GpsError } = require('./guard');
const { LEVELS } = require('./semver');
const { parsePayload } = require('./changelog');

const FRAGMENTS_DIR = '.work/changelog';

function fragmentPath(projectRoot, sessionId) {
  return path.join(projectRoot, ...FRAGMENTS_DIR.split('/'), `${sessionId}.md`);
}

function serializeFragment({ bump, floor, reason, body }) {
  if (reason && /[\r\n]/.test(reason)) throw new GpsError('Fragment reason must be a single line.');
  const lines = ['---', `bump: ${bump}`, `floor: ${floor}`];
  if (reason) lines.push(`reason: ${reason}`);
  lines.push('---', '');
  return lines.join('\n') + body.replace(/\s+$/, '') + '\n';
}

function parseFragment(text) {
  // A leading UTF-8 BOM (some Windows editors write one) is dropped.
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)([\s\S]*)$/.exec(text.replace(/^﻿/, '').replace(/\r\n/g, '\n'));
  if (!match) throw new GpsError('missing front matter');
  const keys = {};
  for (const line of match[1].split('\n')) {
    const kv = /^([A-Za-z]+):\s*(.*?)\s*$/.exec(line);
    if (kv) keys[kv[1]] = kv[2];
  }
  for (const key of ['bump', 'floor']) {
    if (!keys[key]) throw new GpsError(`missing ${key}`);
    if (!LEVELS.includes(keys[key])) throw new GpsError(`${key} "${keys[key]}" is not patch, minor or major`);
  }
  const body = match[2].replace(/^\n+/, '').replace(/\s+$/, '');
  if (!body) throw new GpsError('empty body');
  // The body must be a changelog entry: "### <Section>" headings with bullets, or plain bullets.
  try {
    parsePayload(body, /^### /m.test(body) ? 'sections' : 'plain');
  } catch (err) {
    if (!(err instanceof GpsError)) throw err;
    throw new GpsError(`unparsable body: ${err.message}`);
  }
  return { bump: keys.bump, floor: keys.floor, reason: keys.reason || null, body };
}

function listFragments(projectRoot) {
  const dir = path.join(projectRoot, ...FRAGMENTS_DIR.split('/'));
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => name.endsWith('.md')).sort().map((name) => {
    const file = `${FRAGMENTS_DIR}/${name}`;
    try {
      return { sessionId: name.slice(0, -3), file, ...parseFragment(fs.readFileSync(path.join(dir, name), 'utf-8')) };
    } catch (err) {
      if (!(err instanceof GpsError)) throw err;
      throw new GpsError(`${file}: ${err.message}`, err.hint);
    }
  });
}

function writeFragment(projectRoot, sessionId, fragment) {
  const filePath = fragmentPath(projectRoot, sessionId);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tmpPath, serializeFragment(fragment));
  fs.renameSync(tmpPath, filePath);
  return `${FRAGMENTS_DIR}/${sessionId}.md`;
}

function deleteFragments(projectRoot, files) {
  for (const file of files) fs.rmSync(path.join(projectRoot, ...file.split('/')), { force: true });
}

module.exports = { FRAGMENTS_DIR, fragmentPath, serializeFragment, parseFragment, listFragments, writeFragment, deleteFragments };
