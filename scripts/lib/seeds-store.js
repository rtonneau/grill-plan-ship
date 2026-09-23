// scripts/lib/seeds-store.js
const fs = require('fs');
const path = require('path');
const { writeJsonAtomic } = require('./guard');

const SEEDS_FILENAME = '.pending-seeds.json';

function seedsPath(sessionsDir) {
  return path.join(sessionsDir, SEEDS_FILENAME);
}

// A seeds file that isn't a JSON object is moved aside to
// .pending-seeds.json.corrupt-<timestamp> (never deleted) and treated as
// empty, so the next write can't silently destroy it.
function quarantine(filePath, reason) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const corruptPath = `${filePath}.corrupt-${stamp}`;
  fs.renameSync(filePath, corruptPath);
  console.error(`⚠️  ${SEEDS_FILENAME} was unreadable (${reason}); moved to ${path.basename(corruptPath)} and starting fresh.`);
}

function readSeeds(sessionsDir) {
  const filePath = seedsPath(sessionsDir);
  if (!fs.existsSync(filePath)) return {};
  let seeds;
  try {
    seeds = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    quarantine(filePath, err.message);
    return {};
  }
  if (!seeds || typeof seeds !== 'object' || Array.isArray(seeds)) {
    quarantine(filePath, 'not a JSON object');
    return {};
  }
  return seeds;
}

// Read-only variant for /gps status: never quarantines. Returns
// { seeds, problem } where problem is null or why the file was unreadable.
function peekSeeds(sessionsDir) {
  const filePath = seedsPath(sessionsDir);
  if (!fs.existsSync(filePath)) return { seeds: {}, problem: null };
  let seeds;
  try {
    seeds = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    return { seeds: {}, problem: err.message };
  }
  if (!seeds || typeof seeds !== 'object' || Array.isArray(seeds)) {
    return { seeds: {}, problem: 'not a JSON object' };
  }
  return { seeds, problem: null };
}

function writeSeeds(sessionsDir, seeds) {
  fs.mkdirSync(sessionsDir, { recursive: true });
  writeJsonAtomic(seedsPath(sessionsDir), seeds);
}

function mergeSeeds(sessionsDir, newEntries) {
  const seeds = readSeeds(sessionsDir);
  for (const [slug, entry] of Object.entries(newEntries)) {
    seeds[slug] = entry;
  }
  writeSeeds(sessionsDir, seeds);
  return seeds;
}

function getSeed(sessionsDir, slug) {
  const seeds = readSeeds(sessionsDir);
  return Object.prototype.hasOwnProperty.call(seeds, slug) ? seeds[slug] : null;
}

function removeSeed(sessionsDir, slug) {
  const seeds = readSeeds(sessionsDir);
  if (!Object.prototype.hasOwnProperty.call(seeds, slug)) return false;
  delete seeds[slug];
  writeSeeds(sessionsDir, seeds);
  return true;
}

module.exports = { SEEDS_FILENAME, mergeSeeds, getSeed, removeSeed, peekSeeds };
