#!/usr/bin/env node

/**
 * /gps clean
 *
 *   node clean.js                      list every session with its idleness (read-only)
 *   node clean.js --delete <id>...     delete the named session directories
 *
 * Claude runs --delete only after the user has confirmed the list in chat.
 * The current session is never deleted; branches, PRs and issues are left alone.
 */

const fs = require('fs');
const path = require('path');
const { listCleanable, deleteSessions } = require('./lib/clean');
const { STALE_DAYS, VERY_STALE_DAYS } = require('./lib/staleness');
const { GpsError, runCli } = require('./lib/guard');

runCli(() => {
  const sessionsDir = path.join(process.cwd(), '.work', 'sessions');
  const args = process.argv.slice(2);

  if (!fs.existsSync(sessionsDir)) {
    throw new GpsError('No sessions found.', 'Run /gps start <feature-name> first.');
  }

  if (args.length === 0) {
    const sessions = listCleanable(sessionsDir);
    if (sessions.length === 0) throw new GpsError('No sessions found.', 'Run /gps start <feature-name> first.');
    console.log(JSON.stringify({ staleAfterDays: STALE_DAYS, veryStaleAfterDays: VERY_STALE_DAYS, sessions }, null, 2));
    return;
  }

  if (args[0] !== '--delete' || args.length < 2) {
    throw new GpsError(`Unexpected arguments: ${args.join(' ')}`,
      'Usage: node clean.js (list) or node clean.js --delete <session-id>...');
  }

  const removed = deleteSessions(sessionsDir, args.slice(1));
  for (const sessionId of removed) console.log(`✅ Deleted session ${sessionId}.`);
});
