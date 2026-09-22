// scripts/lib/scout-ingest.js
const fs = require('fs');
const path = require('path');
const { mergeSeeds } = require('./seeds-store');
const { GpsError, isSlug } = require('./guard');

const STRENGTHS = ['Strong', 'Worth exploring', 'Speculative'];
const REQUIRED_TEXT_FIELDS = ['problem', 'solution'];

// Validates every candidate before anything is written. Throws on the
// first invalid one; a repeated slug keeps its first occurrence and adds
// a warning.
function validateCandidates(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new GpsError('No candidates provided.');
  }

  const warnings = [];
  const accepted = [];
  const seen = new Set();

  candidates.forEach((candidate, index) => {
    const label = `candidate #${index + 1}`;
    if (!candidate || typeof candidate !== 'object') {
      throw new GpsError(`${label} is not an object.`);
    }
    if (!isSlug(candidate.slug)) {
      throw new GpsError(`Invalid or missing slug in ${label}: ${JSON.stringify(candidate.slug)}`,
        'Slugs are lowercase a-z, 0-9, with ".", "_" or "-" between them, max 64 characters.');
    }
    if (!STRENGTHS.includes(candidate.strength)) {
      throw new GpsError(`Invalid strength for "${candidate.slug}": ${JSON.stringify(candidate.strength)}`,
        `Use one of: ${STRENGTHS.join(', ')}.`);
    }
    for (const field of REQUIRED_TEXT_FIELDS) {
      if (typeof candidate[field] !== 'string' || !candidate[field].trim()) {
        throw new GpsError(`Missing "${field}" for "${candidate.slug}".`);
      }
    }
    if (candidate.files !== undefined && !Array.isArray(candidate.files)) {
      throw new GpsError(`"files" for "${candidate.slug}" must be an array.`);
    }
    if (seen.has(candidate.slug)) {
      warnings.push(`Duplicate slug "${candidate.slug}" in ${label} ignored; kept the first one.`);
      return;
    }
    seen.add(candidate.slug);
    accepted.push(candidate);
  });

  return { accepted, warnings };
}

// Copies the report without ever overwriting: on a name collision,
// tries -2, -3, ... suffixes.
function copyReportWriteOnce(tempReportPath, reportsDir, baseName) {
  for (let n = 1; n < 1000; n++) {
    const fileName = n === 1 ? `${baseName}.html` : `${baseName}-${n}.html`;
    const destPath = path.join(reportsDir, fileName);
    try {
      fs.copyFileSync(tempReportPath, destPath, fs.constants.COPYFILE_EXCL);
      return { fileName, destPath };
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
  }
  throw new GpsError(`Could not find a free report filename for ${baseName}.`);
}

function ingestScoutReport({ sessionsDir, tempReportPath, sourceDirection, candidates, now }) {
  if (!fs.existsSync(tempReportPath)) {
    throw new GpsError(`Report file not found: ${tempReportPath}`,
      'The architecture-review step must write its HTML report before scout-merge.js runs.');
  }
  const { accepted, warnings } = validateCandidates(candidates);

  const effectiveNow = now || new Date();
  const reportsDir = path.join(sessionsDir, 'scout-reports');
  fs.mkdirSync(reportsDir, { recursive: true });

  const timestamp = effectiveNow.toISOString().replace(/[:.]/g, '-');
  const { fileName: reportFilename, destPath: reportDestPath } =
    copyReportWriteOnce(tempReportPath, reportsDir, `architecture-review-${timestamp}`);

  const sourceReport = ['scout-reports', reportFilename].join('/');
  const createdAt = effectiveNow.toISOString();

  const newEntries = {};
  for (const candidate of accepted) {
    const { slug, strength, files, problem, solution, benefits } = candidate;
    newEntries[slug] = {
      strength,
      files: files || [],
      problem,
      solution,
      benefits: benefits || null,
      sourceDirection: sourceDirection || null,
      sourceReport,
      createdAt,
    };
  }

  mergeSeeds(sessionsDir, newEntries);

  const seeded = Object.entries(newEntries).map(([slug, entry]) => ({
    slug,
    strength: entry.strength,
    problem: entry.problem,
    startCommand: `/gps start ${slug}`,
  }));

  return { reportDestPath, sourceReport, seeded, warnings };
}

module.exports = { STRENGTHS, validateCandidates, ingestScoutReport };
