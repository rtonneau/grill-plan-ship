#!/usr/bin/env node

/**
 * /gps write, step 3
 *
 * Applies the payload Claude wrote to <sessionDir>/.write-payload.md:
 * checks it against the pending phase's headings, fills resume.md or
 * plan.md (with a generated Token Usage section), writes the plan's
 * NN-<slug>.md tickets and removes the [slug] stubs, then deletes the
 * payload. Writes nothing unless every check passes.
 */

const fs = require('fs');
const path = require('path');
const { resolveSession } = require('./lib/session-store');
const { resolveWriteTarget, placeholderTester, checkPlanWritten } = require('./lib/write-target');
const { computeUsage } = require('./lib/token-usage');
const {
  PAYLOAD_FILENAME,
  phaseFilePath,
  loadPhaseFile,
  expectedHeadings,
  expectedFields,
  parsePayload,
  validatePayload,
  renderPhaseFile,
  renderTicket,
} = require('./lib/write-payload');
const { GpsError, runCli } = require('./lib/guard');

const NOTHING_PENDING_HINT = {
  'plan-not-started': 'Run /gps plan first.',
  complete: 'Both phases are written. Run /gps status for the next command.',
};

runCli(() => {
  const { sessionId, sessionDir, config } = resolveSession(process.cwd());
  const { target, reason } = resolveWriteTarget(sessionDir);
  if (target === 'none') {
    throw new GpsError('Nothing to write for this session.', NOTHING_PENDING_HINT[reason]);
  }

  const payloadPath = path.join(sessionDir, PAYLOAD_FILENAME);
  if (!fs.existsSync(payloadPath)) {
    throw new GpsError(
      `No payload at ${payloadPath}.`,
      'Run write-target.js, write the payload to its payloadPath, then run this again.'
    );
  }

  const current = loadPhaseFile(sessionDir, target, config);
  const payload = parsePayload(fs.readFileSync(payloadPath, 'utf-8'));
  const errors = validatePayload(payload, {
    expectedHeadings: expectedHeadings(current),
    expectedFields: expectedFields(current),
    phase: target,
    isUnfilled: placeholderTester(sessionDir),
  });

  const ticketsDir = path.join(sessionDir, '02-plan', 'tickets');
  const stubs = [];
  if (target === 'plan' && fs.existsSync(ticketsDir)) {
    for (const fileName of fs.readdirSync(ticketsDir).filter((f) => f.endsWith('.md'))) {
      if (fileName.includes('[slug]')) stubs.push(fileName);
      else errors.push(`02-plan/tickets/${fileName} already exists. Move or delete it: only [slug] stubs are replaced.`);
    }
  }

  if (errors.length > 0) {
    throw new GpsError(
      `The payload is not ready (nothing was written):\n   - ${errors.join('\n   - ')}`,
      `Fix ${payloadPath} and run write-apply.js again.`
    );
  }

  const targetPath = phaseFilePath(sessionDir, target);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, renderPhaseFile(current, payload.sections, computeUsage(config, target), payload.fields));

  if (target === 'grill') {
    if (resolveWriteTarget(sessionDir).target === 'grill') {
      throw new GpsError(`${targetPath} still has placeholders.`, 'Remove them by hand, then run /gps plan.');
    }
    fs.unlinkSync(payloadPath);
    console.log(`✅ Grill written for ${sessionId}. Next: /gps plan`);
    return;
  }

  fs.mkdirSync(ticketsDir, { recursive: true });
  for (const ticket of payload.tickets) {
    fs.writeFileSync(path.join(ticketsDir, ticket.fileName), renderTicket(ticket));
  }
  for (const stub of stubs) fs.unlinkSync(path.join(ticketsDir, stub));

  const { tickets, skipped } = checkPlanWritten(sessionDir);
  for (const fileName of skipped) {
    console.error(`⚠️  Skipped ${fileName}: ticket files must be named NN-<slug>.md`);
  }
  fs.unlinkSync(payloadPath);
  console.log(`✅ Plan written for ${sessionId}: ${tickets.length} ticket(s). Next: /gps ship`);
});
