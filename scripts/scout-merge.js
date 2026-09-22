#!/usr/bin/env node

/**
 * /gps scout [direction]
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
 * Speculative), problem, solution. Optional: files (array), benefits.
 * Every candidate is validated before anything is written; a repeated
 * slug keeps its first occurrence and is reported under "warnings".
 */

const path = require('path');
const { ingestScoutReport } = require('./lib/scout-ingest');
const { GpsError, readJson, runCli } = require('./lib/guard');

runCli(() => {
  const [tempReportPath, entriesJsonPath] = process.argv.slice(2);
  if (!tempReportPath || !entriesJsonPath) {
    throw new GpsError('Missing arguments.', 'Usage: node scout-merge.js <tempReportPath> <entriesJsonPath>');
  }

  const input = readJson(entriesJsonPath, 'Scout entries file');
  const sessionsDir = path.join(process.cwd(), '.work', 'sessions');

  const result = ingestScoutReport({
    sessionsDir,
    tempReportPath,
    sourceDirection: input.sourceDirection || null,
    candidates: input.candidates,
  });

  for (const warning of result.warnings) console.error(`⚠️  ${warning}`);
  console.log(JSON.stringify(result, null, 2));
});
