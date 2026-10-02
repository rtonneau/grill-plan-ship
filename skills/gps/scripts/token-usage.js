#!/usr/bin/env node

/**
 * node token-usage.js <phaseKey>
 *
 * Prints computed token usage for one phase of the current session as
 * JSON. Used by /gps ship right before it fills in a ticket's
 * commit-log.md, since ticket finalization has no other script call to
 * hang this off of (unlike grill/plan, which get it from write-target.js).
 */

const { computeUsage } = require('./lib/token-usage');
const { resolveSession } = require('./lib/session-store');
const { GpsError, runCli } = require('./lib/guard');

runCli(() => {
  const phaseKey = process.argv[2];
  if (!phaseKey) {
    throw new GpsError('Missing phase key.', 'Usage: node token-usage.js <phaseKey>  (e.g. 03-01-add-thing)');
  }
  const { config } = resolveSession(process.cwd());
  console.log(JSON.stringify(computeUsage(config, phaseKey), null, 2));
});
