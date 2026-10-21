#!/usr/bin/env node

/**
 * clean.js [--json]                    list sessions (most idle first) and scouted seeds
 * clean.js --dry-run <id>... [--json]  validate the ids, print exactly what would go
 * clean.js --delete <id>... [--json]   delete those sessions and drop those seeds
 *
 * /gps clean. An id is a session id or a seed slug. Every id is validated
 * before anything is removed; the current session is never deleted.
 * Claude runs --delete only after the user confirmed the --dry-run output.
 * .current-session, scout reports, branches, PRs and issues are left alone.
 */

const fs = require('fs');
const { main } = require('./lib/cli');
const { sessionsDirOf } = require('./lib/session-store');
const { listCleanable, listSeeds, planDeletion, applyDeletion, renderList, renderPlan } = require('./lib/clean');
const { STALE_DAYS, VERY_STALE_DAYS } = require('./lib/staleness');
const { GpsError, UsageError } = require('./lib/guard');

const NOTHING = ['Nothing to clean: no sessions or scouted seeds.', 'Run /gps start <feature-name> or /gps scout first.'];

main({
  usage: 'clean.js [--dry-run|--delete <id>...] [--json]',
  positionals: { min: 0, max: Infinity },
  options: { 'dry-run': 'boolean', delete: 'boolean' },
  run({ positionals: ids, options, projectRoot }) {
    const sessionsDir = sessionsDirOf(projectRoot);
    const dryRun = options['dry-run'];
    if (dryRun && options.delete) throw new UsageError('Use --dry-run or --delete, not both.');
    if ((dryRun || options.delete) !== ids.length > 0) {
      throw new UsageError(ids.length > 0 ? 'Ids need --dry-run or --delete.' : 'Name the ids to remove.');
    }
    if (!fs.existsSync(sessionsDir)) throw new GpsError(...NOTHING);

    if (ids.length === 0) {
      const sessions = listCleanable(sessionsDir);
      const { seeds, problem } = listSeeds(sessionsDir);
      if (sessions.length === 0 && seeds.length === 0 && !problem) throw new GpsError(...NOTHING);
      return {
        text: renderList(sessions, seeds, problem),
        data: { staleAfterDays: STALE_DAYS, veryStaleAfterDays: VERY_STALE_DAYS, sessions, seeds, seedsProblem: problem },
      };
    }

    const plan = planDeletion(sessionsDir, ids);
    if (dryRun) {
      return {
        text: `${renderPlan(plan)}\nNext: confirm with the user, then run clean.js --delete ${ids.join(' ')}.`,
        data: { dryRun: true, ...plan },
      };
    }
    applyDeletion(sessionsDir, plan);
    return {
      text: [
        ...plan.sessions.map((s) => `✅ Deleted session ${s.sessionId}.`),
        ...plan.seeds.map((i) => `✅ Dropped scouted seed ${i.slug}.`),
      ].join('\n'),
      data: { deleted: { sessions: plan.sessions.map((s) => s.sessionId), seeds: plan.seeds.map((i) => i.slug) } },
    };
  },
});
