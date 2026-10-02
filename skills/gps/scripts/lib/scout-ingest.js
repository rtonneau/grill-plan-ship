// scripts/lib/scout-ingest.js
const fs = require('fs');
const path = require('path');
const { mergeSeeds } = require('./seeds-store');
const { GpsError, isSlug, slugify, MAX_SLUG_LENGTH } = require('./guard');

const STRENGTHS = ['Strong', 'Worth exploring', 'Speculative'];
const REQUIRED_TEXT_FIELDS = ['problem', 'solution'];
const MAX_SEVERITY_LENGTH = 32;

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
    if (candidate.severity !== undefined && candidate.severity !== null
      && (typeof candidate.severity !== 'string' || !candidate.severity.trim()
        || candidate.severity.length > MAX_SEVERITY_LENGTH)) {
      throw new GpsError(`Invalid severity for "${candidate.slug}": ${JSON.stringify(candidate.severity)}`,
        `Severity is optional; when given it must be a non-empty string of at most ${MAX_SEVERITY_LENGTH} characters.`);
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
function copyReportWriteOnce(reportPath, reportsDir, baseName, ext) {
  for (let n = 1; n < 1000; n++) {
    const fileName = n === 1 ? `${baseName}${ext}` : `${baseName}-${n}${ext}`;
    const destPath = path.join(reportsDir, fileName);
    try {
      fs.copyFileSync(reportPath, destPath, fs.constants.COPYFILE_EXCL);
      return { fileName, destPath };
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
  }
  throw new GpsError(`Could not find a free report filename for ${baseName}.`);
}

// Throws unless reportPath is an existing regular file, with wording for
// the mode: a scout temp report, or a review the user pointed --from at.
function checkReportFile(reportPath, isReview) {
  const hint = isReview
    ? 'Check the path; a relative path is resolved from the project root.'
    : 'The architecture-review step must write its HTML report before scout-merge.js runs.';
  let stat = null;
  try {
    stat = fs.statSync(reportPath);
  } catch (_err) {
    // missing or unreadable: reported below
  }
  if (!stat) throw new GpsError(`${isReview ? 'Review' : 'Report'} file not found: ${reportPath}`, hint);
  if (!stat.isFile()) throw new GpsError(`Not a file: ${reportPath}`, hint);
}

// Archive name for a --from review: review-<stem>-<ts><ext>, keeping the
// original extension (lowercased). A stem with no letters or digits
// becomes "file" rather than slugify's untitled-<time> fallback.
function reviewArchiveName(sourcePath, timestamp) {
  const originalExt = path.extname(sourcePath);
  const rawStem = path.basename(sourcePath, originalExt);
  const hasText = /[a-z0-9]/.test(rawStem.normalize('NFKD').toLowerCase());
  const stem = hasText ? slugify(rawStem).slice(0, MAX_SLUG_LENGTH) : 'file';
  return { baseName: `review-${stem}-${timestamp}`, ext: originalExt.toLowerCase() };
}

// Project-relative with "/" when the file is inside projectRoot,
// otherwise absolute.
function recordedSourcePath(sourcePath, projectRoot) {
  const absolute = path.resolve(sourcePath);
  const relative = path.relative(projectRoot, absolute);
  if (relative && relative.split(path.sep)[0] !== '..' && !path.isAbsolute(relative)) {
    return relative.split(path.sep).join('/');
  }
  return absolute;
}

function ingestScoutReport({ sessionsDir, reportPath, sourcePath, sourceDirection, candidates, now }) {
  const isReview = Boolean(sourcePath);
  checkReportFile(reportPath, isReview);
  const { accepted, warnings } = validateCandidates(candidates);

  const effectiveNow = now || new Date();
  const reportsDir = path.join(sessionsDir, 'scout-reports');
  fs.mkdirSync(reportsDir, { recursive: true });

  const timestamp = effectiveNow.toISOString().replace(/[:.]/g, '-');
  const { baseName, ext } = isReview
    ? reviewArchiveName(sourcePath, timestamp)
    : { baseName: `architecture-review-${timestamp}`, ext: '.html' };
  const { fileName: reportFilename, destPath: reportDestPath } =
    copyReportWriteOnce(reportPath, reportsDir, baseName, ext);

  const sourceReport = ['scout-reports', reportFilename].join('/');
  const createdAt = effectiveNow.toISOString();
  const projectRoot = path.resolve(sessionsDir, '..', '..');
  const recordedSource = isReview ? recordedSourcePath(sourcePath, projectRoot) : null;

  const newEntries = {};
  for (const candidate of accepted) {
    const { slug, strength, severity, files, problem, solution, benefits } = candidate;
    newEntries[slug] = {
      strength,
      severity: severity || null,
      files: files || [],
      problem,
      solution,
      benefits: benefits || null,
      sourceDirection: sourceDirection || null,
      sourceReport,
      sourcePath: recordedSource,
      createdAt,
    };
  }

  mergeSeeds(sessionsDir, newEntries);

  const seeded = Object.entries(newEntries).map(([slug, entry]) => ({
    slug,
    strength: entry.strength,
    severity: entry.severity,
    problem: entry.problem,
    startCommand: `/gps start ${slug}`,
  }));

  return { reportDestPath, sourceReport, seeded, warnings };
}

module.exports = { STRENGTHS, MAX_SEVERITY_LENGTH, validateCandidates, ingestScoutReport };
