// scripts/lib/seeds-store.js
const fs = require('fs');
const path = require('path');

const SEEDS_FILENAME = '.pending-seeds.json';

function seedsPath(sessionsDir) {
  return path.join(sessionsDir, SEEDS_FILENAME);
}

function readSeeds(sessionsDir) {
  const filePath = seedsPath(sessionsDir);
  if (!fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function writeSeeds(sessionsDir, seeds) {
  fs.mkdirSync(sessionsDir, { recursive: true });
  fs.writeFileSync(seedsPath(sessionsDir), JSON.stringify(seeds, null, 2));
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

module.exports = { SEEDS_FILENAME, mergeSeeds, getSeed, removeSeed };
