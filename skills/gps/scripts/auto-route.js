#!/usr/bin/env node

/**
 * auto-route.js [plan|ship|finish] [--delegate] [--json]
 *
 * /gps auto: prints the steps that take the current session from its phase
 * to the target (default finish) and the questions to ask before running
 * them. --delegate presets the ship mode to subagent + inline follow-up.
 * Records an auto_started event once the route is valid. Runs no step
 * itself: references/auto.md drives them.
 */

const { main } = require('./lib/cli');
const { computeRoute } = require('./lib/auto-route');
const { resolveSession } = require('./lib/session-store');
const { recordEvent } = require('./lib/history');

const DELEGATE_SHIP_MODE = 'subagent+inline';

main({
  usage: 'auto-route.js [plan|ship|finish] [--delegate] [--json]',
  positionals: { min: 0, max: 1 },
  options: { delegate: 'boolean' },
  run({ positionals, options, projectRoot, warn }) {
    const { sessionId, sessionDir, configPath, config } = resolveSession(projectRoot);
    const { target, steps, questions, shipMode } = computeRoute(sessionDir, config, positionals[0] || 'finish',
      { shipMode: options.delegate ? DELEGATE_SHIP_MODE : undefined });
    if (options.delegate && !shipMode) warn('--delegate ignored: this route has no ship step.');

    recordEvent(configPath, config, sessionDir, {
      event: 'auto_started',
      detail: { target, steps: steps.join(' → '), ...(shipMode && { shipMode }) },
    });

    const lines = [`Route for ${sessionId} (target ${target}): ${steps.join(' → ')}`];
    if (questions.includes('ship-mode')) {
      lines.push('Ask once, before the first step: the ship mode (subagent + inline follow-up (Recommended), subagent, or inline).');
    } else if (shipMode) {
      lines.push(`Ship mode: ${shipMode} (preset by --delegate); ask nothing.`);
    } else {
      lines.push('Ask nothing.');
    }
    return { text: lines.join('\n'), data: { sessionId, target, steps, questions, ...(shipMode && { shipMode }) } };
  },
});
