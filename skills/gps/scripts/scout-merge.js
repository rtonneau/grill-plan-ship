#!/usr/bin/env node

/**
 * /gps scout [--from <review-file>] [direction]
 *
 * Called by Claude Code after running the architecture-review skill's
 * steps 1-2 (explore + write the HTML report to the OS temp dir) and
 * synthesizing candidate data from that report's cards. Copies the report
 * into .work/sessions/scout-reports/ (write-once; a name collision gets a
 * -2, -3, ... suffix) and merges seed entries into
 * .work/sessions/.pending-seeds.json, then prints a JSON summary for
 * Claude to present in chat as /gps start <slug> options.
 *
 * Usage: node scout-merge.js <tempReportPath> <entriesJsonPath>
 *    or: node scout-merge.js --from <reviewPath> <entriesJsonPath>
 *
 * With --from (/gps scout --from <review-file>), the review the user
 * pointed at is archived as scout-reports/review-<stem>-<timestamp><ext>
 * (original extension kept) and every seed records its sourcePath.
 *
 * entriesJsonPath must contain:
 *   {
 *     "sourceDirection": "only review sim.cc" | null,
 *     "candidates": [
 *       { "slug": "runconfig-resolver", "strength": "Strong", "files": ["sim.cc"],
 *         "problem": "...", "solution": "...", "benefits": "..." }
 *     ]
 *   }
 * Required per candidate: slug, strength (Strong | Worth exploring |
 * Speculative), problem, solution. Optional: files (array), benefits,
 * severity (non-empty string, max 32 characters).
 * Every candidate is validated before anything is written; a repeated
 * slug keeps its first occurrence and is reported under "warnings".
 */

const path = require('path');
const { ingestScoutReport } = require('./lib/scout-ingest');
const { GpsError, readJson, runCli } = require('./lib/guard');

const USAGE = 'Usage: node scout-merge.js <tempReportPath> <entriesJsonPath> | --from <reviewPath> <entriesJsonPath>';

// --from may only come first; any other "--" argument is an unknown option.
function parseArgs(argv) {
  const fromReview = argv[0] === '--from';
  const args = fromReview ? argv.slice(1) : argv;
  const flag = args.find((arg) => arg.startsWith('--'));
  if (flag) throw new GpsError(`Unknown option: ${flag}`, USAGE);
  if (fromReview && args.length === 0) throw new GpsError('--from needs a review file path.', USAGE);
  if (args.length < 2) throw new GpsError('Missing arguments.', USAGE);
  if (args.length > 2) throw new GpsError('Too many arguments.', USAGE);
  const [reportPath, entriesJsonPath] = args;
  return { reportPath, entriesJsonPath, sourcePath: fromReview ? reportPath : null };
}

runCli(() => {
  const { reportPath, entriesJsonPath, sourcePath } = parseArgs(process.argv.slice(2));

  const input = readJson(entriesJsonPath, 'Scout entries file');
  const sessionsDir = path.join(process.cwd(), '.work', 'sessions');

  const result = ingestScoutReport({
    sessionsDir,
    reportPath,
    sourcePath,
    sourceDirection: input.sourceDirection || null,
    candidates: input.candidates,
  });

  for (const warning of result.warnings) console.error(`⚠️  ${warning}`);
  console.log(JSON.stringify(result, null, 2));
});
