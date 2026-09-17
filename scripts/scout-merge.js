#!/usr/bin/env node

/**
 * /gps scout [direction]
 *
 * Called by Claude Code after running improve-codebase-architecture's
 * steps 1-2 (explore + write the HTML report to the OS temp dir) and
 * synthesizing candidate data from that report's cards. Copies the report
 * into .work/sessions/scout-reports/ (write-once) and merges seed entries
 * into .work/sessions/.pending-seeds.json, then prints a JSON summary for
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
 */

const fs = require('fs');
const path = require('path');
const { ingestScoutReport } = require('./lib/scout-ingest');

function main() {
  const [tempReportPath, entriesJsonPath] = process.argv.slice(2);
  if (!tempReportPath || !entriesJsonPath) {
    console.error('Usage: node scout-merge.js <tempReportPath> <entriesJsonPath>');
    process.exit(1);
  }

  const input = JSON.parse(fs.readFileSync(entriesJsonPath, 'utf-8'));
  const sessionsDir = path.join(process.cwd(), '.work', 'sessions');

  const result = ingestScoutReport({
    sessionsDir,
    tempReportPath,
    sourceDirection: input.sourceDirection || null,
    candidates: input.candidates,
  });

  console.log(JSON.stringify(result, null, 2));
}

main();
