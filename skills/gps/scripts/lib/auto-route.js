// skills/gps/scripts/lib/auto-route.js
//
// /gps auto: the steps that carry the current session from its phase to a
// target, in pipeline order, plus the questions to ask before the run.
// The phase comes from resolveWriteTarget, as everywhere else. A preset
// ship mode (--delegate) replaces the ship-mode question when the route ships.

const { resolveWriteTarget } = require('./write-target');
const { isFinished } = require('./phase');
const { GpsError } = require('./guard');

const STEPS = ['write:grill', 'plan', 'write:plan', 'ship', 'finish'];
const TARGETS = ['plan', 'ship', 'finish'];
const TARGET_LAST_STEP = { plan: 'write:plan', ship: 'ship', finish: 'finish' };
const TARGET_COMMAND = { plan: '/gps auto plan', ship: '/gps auto ship', finish: '/gps auto' };

function firstStep(sessionDir) {
  const { target, reason } = resolveWriteTarget(sessionDir);
  if (target === 'grill') return 'write:grill';
  if (target === 'plan') return 'write:plan';
  return reason === 'plan-not-started' ? 'plan' : 'ship';
}

function computeRoute(sessionDir, config, target = 'finish', { shipMode } = {}) {
  if (isFinished(config)) {
    throw new GpsError('This session is already finished.',
      'Run /gps status to pick another session, or /gps start <feature-name>.');
  }
  if (!TARGETS.includes(target)) {
    throw new GpsError(`Unknown target "${target}": use ${TARGETS.join(', ')}.`, 'Example: /gps auto ship');
  }

  const first = STEPS.indexOf(firstStep(sessionDir));
  const last = STEPS.indexOf(TARGET_LAST_STEP[target]);
  if (last < first) {
    const reachable = TARGETS.filter((t) => STEPS.indexOf(TARGET_LAST_STEP[t]) >= first);
    throw new GpsError(`Target "${target}" is already done.`,
      `Reachable from here: ${reachable.join(', ')} (${reachable.map((t) => TARGET_COMMAND[t]).join(', ')}).`);
  }

  const steps = STEPS.slice(first, last + 1);
  if (!steps.includes('ship')) return { target, steps, questions: [] };
  return shipMode ? { target, steps, questions: [], shipMode } : { target, steps, questions: ['ship-mode'] };
}

module.exports = { STEPS, TARGETS, computeRoute };
