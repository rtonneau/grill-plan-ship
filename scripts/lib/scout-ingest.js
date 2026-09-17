// scripts/lib/scout-ingest.js
const fs = require('fs');
const path = require('path');
const { mergeSeeds } = require('./seeds-store');

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function ingestScoutReport({ sessionsDir, tempReportPath, sourceDirection, candidates, now }) {
  if (!fs.existsSync(tempReportPath)) {
    throw new Error(`Report file not found: ${tempReportPath}`);
  }
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error('No candidates provided.');
  }
  for (const candidate of candidates) {
    if (!candidate.slug || !SLUG_RE.test(candidate.slug)) {
      throw new Error(`Invalid or missing slug: ${JSON.stringify(candidate.slug)}`);
    }
  }

  const effectiveNow = now || new Date();
  const reportsDir = path.join(sessionsDir, 'scout-reports');
  fs.mkdirSync(reportsDir, { recursive: true });

  const timestamp = effectiveNow.toISOString().replace(/[:.]/g, '-');
  const reportFilename = `architecture-review-${timestamp}.html`;
  const reportDestPath = path.join(reportsDir, reportFilename);
  // COPYFILE_EXCL: refuse to overwrite an existing report (write-once guarantee)
  fs.copyFileSync(tempReportPath, reportDestPath, fs.constants.COPYFILE_EXCL);

  const sourceReport = ['scout-reports', reportFilename].join('/');
  const createdAt = effectiveNow.toISOString();

  const newEntries = {};
  for (const candidate of candidates) {
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

  return { reportDestPath, sourceReport, seeded };
}

module.exports = { ingestScoutReport };
