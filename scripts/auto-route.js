#!/usr/bin/env node

/**
 * /gps auto [--delegate] [plan|ship|finish]
 *
 * Prints the steps that take the current session from its phase to the
 * target (default finish), and the questions to ask before running them.
 * --delegate presets the ship mode to subagent + inline follow-up.
 * Records an auto_started event once the route is valid. Does not run any
 * step itself: references/auto.md drives them.
 */

const { computeRoute } = require('./lib/auto-route');
const { resolveSession } = require('./lib/session-store');
const { recordEvent } = require('./lib/history');
const { GpsError, runCli } = require('./lib/guard');

const DELEGATE_SHIP_MODE = 'subagent+inline';

runCli(() => {
  const argv = process.argv.slice(2);
  const delegate = argv.includes('--delegate');
  const args = argv.filter((a) => a !== '--delegate');
  if (args.length > 1) {
    throw new GpsError('Give at most one target: plan, ship or finish.', 'Example: /gps auto ship');
  }

  const { sessionId, sessionDir, configPath, config } = resolveSession(process.cwd());
  const { target, steps, questions, shipMode } = computeRoute(sessionDir, config, args[0] ?? 'finish',
    { shipMode: delegate ? DELEGATE_SHIP_MODE : undefined });
  if (delegate && !shipMode) {
    console.error('⚠️  --delegate ignored: this route has no ship step.');
  }

  recordEvent(configPath, config, sessionDir, {
    event: 'auto_started',
    detail: { target, steps: steps.join(' → '), ...(shipMode && { shipMode }) },
  });

  console.log(JSON.stringify({ sessionId, target, steps, questions, ...(shipMode && { shipMode }) }, null, 2));
});
