#!/usr/bin/env node

/**
 * set-current.js <session-id> --confirmed [--json]
 *
 * Points .work/sessions/.current-session at an existing, unfinished
 * session. Requires --confirmed: the agent asks the user (the router's host
 * question rule) which session to use, and only passes --confirmed after
 * the user answers (after /gps finish lists the unfinished sessions, or
 * when a script reports that the current session can't be resolved).
 */

const fs = require('fs');
const path = require('path');
const { main } = require('./lib/cli');
const {
  CONFIG_FILENAME, sessionsDirOf, setCurrentSession, isSafeSessionName, listUnfinishedSessions,
} = require('./lib/session-store');
const { isFinished, computeSessionState } = require('./lib/phase');
const { GpsError, UsageError, readJson } = require('./lib/guard');

main({
  usage: 'set-current.js <session-id> --confirmed [--json]',
  positionals: { min: 1, max: 1 },
  options: { confirmed: 'boolean' },
  run({ positionals: [sessionId], options, projectRoot }) {
    const sessionsDir = sessionsDirOf(projectRoot);
    const available = () => `Unfinished sessions: ${listUnfinishedSessions(sessionsDir).map((s) => s.sessionId).join(', ') || 'none'}`;

    if (!options.confirmed) {
      throw new UsageError('Switching sessions needs the user\'s confirmation first.', 'Ask the user (the router\'s host question rule) which session to use, then rerun with --confirmed.');
    }
    if (!isSafeSessionName(sessionId)) throw new UsageError(`Invalid session id: ${JSON.stringify(sessionId)}`, available());
    const configPath = path.join(sessionsDir, sessionId, CONFIG_FILENAME);
    if (!fs.existsSync(configPath)) throw new GpsError(`Session ${sessionId} not found.`, available());
    const config = readJson(configPath, `${CONFIG_FILENAME} of ${sessionId}`);
    if (isFinished(config)) {
      throw new GpsError(`Session ${sessionId} is already finished.`, available());
    }

    setCurrentSession(sessionsDir, sessionId);
    const { phase, suggestedNext } = computeSessionState(path.join(sessionsDir, sessionId), config);
    return {
      text: `✅ Current session is now ${sessionId} (phase ${phase}).\nNext: ${suggestedNext.command} — ${suggestedNext.why}`,
      data: { sessionId, phase, suggestedNext },
    };
  },
});
