#!/usr/bin/env node

/**
 * /gps write, step 1
 *
 * Detects which phase (grill or plan) still needs its output written and,
 * when one is pending, prints where Claude writes the payload, which
 * "**Label:**" header fields and "## " sections it must contain. write-apply.js then turns the payload
 * into the phase's files.
 */

const fs = require('fs');
const path = require('path');
const { resolveWriteTarget } = require('./lib/write-target');
const { resolveSession } = require('./lib/session-store');
const { touchPhase } = require('./lib/token-usage');
const { PAYLOAD_FILENAME, loadPhaseFile, expectedHeadings, expectedFields } = require('./lib/write-payload');
const { writeJsonAtomic, runCli } = require('./lib/guard');

runCli(() => {
  const { sessionId, sessionDir, configPath, config } = resolveSession(process.cwd());
  const result = resolveWriteTarget(sessionDir);

  if (result.target === 'grill' || result.target === 'plan') {
    touchPhase(config, result.target);
    writeJsonAtomic(configPath, config);
    result.payloadPath = path.join(sessionDir, PAYLOAD_FILENAME);
    result.existingPayload = fs.existsSync(result.payloadPath);
    const phaseFile = loadPhaseFile(sessionDir, result.target, config);
    result.fields = expectedFields(phaseFile);
    result.sections = expectedHeadings(phaseFile);
    if (result.target === 'plan') result.ticketSeparator = '--- ticket: NN-<slug> ---';
  }

  console.log(JSON.stringify({ sessionId, sessionDir, ...result }, null, 2));
});
