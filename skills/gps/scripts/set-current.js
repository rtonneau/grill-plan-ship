#!/usr/bin/env node

/**
 * set-current.js <session-id> [--json]
 *
 * Points .work/sessions/.current-session at an existing, unfinished
 * session. Claude runs it only after the user confirmed the switch (after
 * /gps finish lists the unfinished sessions, or when a script reports that
 * the current session can't be resolved).
 */

const fs = require('fs');
const path = require('path');
const { main } = require('./lib/cli');
const {
  CONFIG_FILENAME, sessionsDirOf, setCurrentSession, isSafeSessionName, listUnfinishedSessions,
} = require('./lib/session-store');
const { isFinished } = require('./lib/phase');
const { GpsError, UsageError, readJson } = require('./lib/guard');

main({
  usage: 'set-current.js <session-id> [--json]',
  positionals: { min: 1, max: 1 },
  run({ positionals: [sessionId], projectRoot }) {
    const sessionsDir = sessionsDirOf(projectRoot);
    const available = () => `Unfinished sessions: ${listUnfinishedSessions(sessionsDir).map((s) => s.sessionId).join(', ') || 'none'}`;

    if (!isSafeSessionName(sessionId)) throw new UsageError(`Invalid session id: ${JSON.stringify(sessionId)}`, available());
    const configPath = path.join(sessionsDir, sessionId, CONFIG_FILENAME);
    if (!fs.existsSync(configPath)) throw new GpsError(`Session ${sessionId} not found.`, available());
    if (isFinished(readJson(configPath, `${CONFIG_FILENAME} of ${sessionId}`))) {
      throw new GpsError(`Session ${sessionId} is already finished.`, available());
    }

    setCurrentSession(sessionsDir, sessionId);
    return {
      text: `✅ Current session is now ${sessionId}. Next: /gps status to see where it left off.`,
      data: { sessionId },
    };
  },
});
