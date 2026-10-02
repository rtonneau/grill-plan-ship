#!/usr/bin/env node

/**
 * /gps clean
 *
 *   node clean.js                 list every session with its idleness, and the
 *                                 scouted ideas not started yet (read-only)
 *   node clean.js --delete <id>...
 *                                 delete the named sessions and drop the named ideas
 *                                 (an id is a session id or an idea slug)
 *
 * Claude runs --delete only after the user has confirmed the list in chat.
 * The current session is never deleted; branches, PRs, issues and scout
 * reports are left alone.
 */

const fs = require('fs');
const path = require('path');
const { listCleanable, listIdeas, deleteEntries } = require('./lib/clean');
const { STALE_DAYS, VERY_STALE_DAYS } = require('./lib/staleness');
const { GpsError, runCli } = require('./lib/guard');

const NOTHING = ['Nothing to clean: no sessions or scouted ideas.', 'Run /gps start <feature-name> or /gps scout first.'];

runCli(() => {
  const sessionsDir = path.join(process.cwd(), '.work', 'sessions');
  const args = process.argv.slice(2);

  if (!fs.existsSync(sessionsDir)) throw new GpsError(...NOTHING);

  if (args.length === 0) {
    const sessions = listCleanable(sessionsDir);
    const { ideas, problem } = listIdeas(sessionsDir);
    if (sessions.length === 0 && ideas.length === 0 && !problem) throw new GpsError(...NOTHING);
    console.log(JSON.stringify({
      staleAfterDays: STALE_DAYS, veryStaleAfterDays: VERY_STALE_DAYS, sessions, ideas, ideasProblem: problem,
    }, null, 2));
    return;
  }

  if (args[0] !== '--delete' || args.length < 2) {
    throw new GpsError(`Unexpected arguments: ${args.join(' ')}`,
      'Usage: node clean.js (list) or node clean.js --delete <session-id|idea-slug>...');
  }

  const removed = deleteEntries(sessionsDir, args.slice(1));
  for (const sessionId of removed.sessions) console.log(`✅ Deleted session ${sessionId}.`);
  for (const slug of removed.ideas) console.log(`✅ Dropped scouted idea ${slug}.`);
});
