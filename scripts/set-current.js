#!/usr/bin/env node

/**
 * Internal (no /gps command): node set-current.js <session-id>
 *
 * Points .work/sessions/.current-session at an existing, unfinished
 * session. Claude runs this only after the user has confirmed the switch
 * (e.g. when /gps finish lists the remaining unfinished sessions, or to
 * recover from an invalid pointer).
 */

const fs = require('fs');
const path = require('path');
const { setCurrentSession, isFinished, listUnfinishedSessions } = require('./lib/session-store');
const { GpsError, isSlug, readJson, runCli } = require('./lib/guard');

runCli(() => {
  const sessionId = process.argv[2];
  const sessionsDir = path.join(process.cwd(), '.work', 'sessions');
  const available = () => listUnfinishedSessions(sessionsDir).map((s) => s.sessionId).join(', ') || 'none';

  const match = typeof sessionId === 'string' && sessionId.match(/^\d{4}-\d{2}-\d{2}__(.+)$/);
  if (!match || !isSlug(match[1])) {
    throw new GpsError(`Invalid session id: ${JSON.stringify(sessionId)}`,
      `Usage: node set-current.js <YYYY-MM-DD__slug>. Unfinished sessions: ${available()}`);
  }

  const configPath = path.join(sessionsDir, sessionId, '.session-config.json');
  if (!fs.existsSync(configPath)) {
    throw new GpsError(`Session ${sessionId} not found.`, `Unfinished sessions: ${available()}`);
  }
  if (isFinished(readJson(configPath, `.session-config.json of ${sessionId}`))) {
    throw new GpsError(`Session ${sessionId} is already finished.`, `Unfinished sessions: ${available()}`);
  }

  setCurrentSession(sessionsDir, sessionId);
  console.log(`✅ Current session is now ${sessionId}. Run /gps status to see where it left off.`);
});
