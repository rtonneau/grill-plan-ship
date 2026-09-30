#!/usr/bin/env node

/**
 * /gps auto [plan|ship|finish]
 *
 * Prints the steps that take the current session from its phase to the
 * target (default finish), and the questions to ask before running them.
 * Records an auto_started event once the route is valid. Does not run any
 * step itself: references/auto.md drives them.
 */

const { computeRoute } = require('./lib/auto-route');
const { resolveSession } = require('./lib/session-store');
const { recordEvent } = require('./lib/history');
const { GpsError, runCli } = require('./lib/guard');

runCli(() => {
  const args = process.argv.slice(2);
  if (args.length > 1) {
    throw new GpsError('Give at most one target: plan, ship or finish.', 'Example: /gps auto ship');
  }

  const { sessionId, sessionDir, configPath, config } = resolveSession(process.cwd());
  const { target, steps, questions } = computeRoute(sessionDir, config, args[0] ?? 'finish');

  recordEvent(configPath, config, sessionDir, {
    event: 'auto_started',
    detail: { target, steps: steps.join(' → ') },
  });

  console.log(JSON.stringify({ sessionId, target, steps, questions }, null, 2));
});
