#!/usr/bin/env node

/**
 * scout-merge.js <report.html> <entries.json> [--json]
 * scout-merge.js --from <review-file> <entries.json> [--json]
 *
 * /gps scout: after Claude has turned a report into candidates, copies the
 * report write-once into .work/sessions/scout-reports/ and merges the
 * candidates into .work/sessions/.pending-seeds.json (one seed per slug, a
 * fresh one replaces an older one). With --from the user's review is
 * archived as review-<stem>-<timestamp><ext> and every seed records its
 * sourcePath. Every candidate is validated before anything is written.
 *
 * entries.json: { "sourceDirection": string | null, "candidates": [
 *   { "slug", "strength": "Strong" | "Worth exploring" | "Speculative",
 *     "problem", "solution", "files"?: [paths], "benefits"?, "severity"? } ] }
 */

const { main } = require('./lib/cli');
const { sessionsDirOf } = require('./lib/session-store');
const { ingestScoutReport } = require('./lib/scout-ingest');
const { UsageError, readJson } = require('./lib/guard');

main({
  usage: 'scout-merge.js (<report.html> | --from <review-file>) <entries.json> [--json]',
  positionals: { min: 1, max: 2 },
  options: { from: 'string' },
  run({ positionals, options, projectRoot, warn }) {
    const expected = options.from ? 1 : 2;
    if (positionals.length !== expected) {
      throw new UsageError(options.from ? 'With --from, give only the entries file.' : 'Give the report and the entries file.');
    }
    const input = readJson(positionals[expected - 1], 'Scout entries file');

    const result = ingestScoutReport({
      sessionsDir: sessionsDirOf(projectRoot),
      reportPath: options.from || positionals[0],
      sourcePath: options.from,
      sourceDirection: input.sourceDirection || null,
      candidates: input.candidates,
    });
    for (const warning of result.warnings) warn(warning);

    const lines = [`✅ Seeded ${result.seeded.length} idea(s); report archived as .work/sessions/${result.sourceReport}`, ''];
    for (const s of result.seeded) {
      const badge = s.severity ? `${s.severity} · ${s.strength}` : s.strength;
      lines.push(`- \`${s.startCommand}\` — ${badge} — ${s.problem.split('\n')[0]}`);
    }
    lines.push('', 'Next: /gps start <slug> for the idea to pursue; the grill opens seeded with it.');
    return { text: lines.join('\n'), data: result };
  },
});
