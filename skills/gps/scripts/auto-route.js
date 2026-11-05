#!/usr/bin/env node

/**
 * auto-route.js [plan|ship|finish] [--delegate|--inline] [--json]
 *
 * /gps auto: prints the steps that take the current session from its phase
 * to the target (default finish). --delegate or --inline presets the ship mode;
 * otherwise the agent chooses per ticket.
 * Records an auto_started event once the route is valid. Runs no step
 * itself: references/auto.md drives them.
 */

const { main } = require('./lib/cli');
const { computeRoute } = require('./lib/auto-route');
const { resolveSession } = require('./lib/session-store');
const { recordEvent } = require('./lib/history');
const { shipSettings } = require('./lib/project-config');
const { UsageError } = require('./lib/guard');

main({
  usage: 'auto-route.js [plan|ship|finish] [--delegate|--inline] [--json]',
  positionals: { min: 0, max: 1 },
  options: { delegate: 'boolean', inline: 'boolean' },
  run({ positionals, options, projectRoot, warn }) {
    if (options.delegate && options.inline) throw new UsageError('Give --delegate or --inline, not both.');
    const preset = (options.delegate && 'delegate') || (options.inline && 'inline') || undefined;
    const { sessionId, sessionDir, configPath, config } = resolveSession(projectRoot);
    const { target, steps, shipMode, chainedFinish } = computeRoute(sessionDir, config, positionals[0] || 'finish',
      { shipMode: preset, autoFinish: shipSettings(projectRoot).autoFinish });
    if (preset && !shipMode) warn(`--${preset} ignored: this route has no ship step.`);

    recordEvent(configPath, config, sessionDir, {
      event: 'auto_started',
      detail: { target, steps: steps.join(' → '), ...(shipMode && { shipMode }) },
    });

    const lines = [`Route for ${sessionId} (target ${target}): ${steps.join(' → ')}`];
    if (chainedFinish) lines.push('finish follows ship because ship.autoFinish is on.');
    if (shipMode) lines.push(`Ship mode: ${shipMode} (preset).`);
    return { text: lines.join('\n'), data: { sessionId, target, steps, ...(chainedFinish && { chainedFinish }), ...(shipMode && { shipMode }) } };
  },
});
