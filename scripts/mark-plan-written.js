#!/usr/bin/env node

/**
 * Called by /gps write after it has filled in 02-plan/plan.md and the
 * real ticket files. The plan phase's state is derived from those files,
 * so this only verifies the write is complete: it fails, listing what is
 * still unfilled, if plan.md or a ticket still has placeholders or a
 * "[slug]" stub remains.
 */

const { resolveSession } = require('./lib/session-store');
const { resolveWriteTarget } = require('./lib/write-target');
const { listTickets } = require('./lib/ticket-queue');
const { GpsError, runCli } = require('./lib/guard');

runCli(() => {
  const { sessionId, sessionDir } = resolveSession(process.cwd());
  const writeTarget = resolveWriteTarget(sessionDir);

  if (writeTarget.target === 'grill') {
    throw new GpsError('The grill phase is not written yet.', 'Fill 01-grill/resume.md first (/gps write).');
  }
  if (writeTarget.reason === 'plan-not-started') {
    throw new GpsError('This session has no plan yet.', 'Run /gps plan first.');
  }
  if (writeTarget.target === 'plan') {
    throw new GpsError(
      `The plan is not fully written: plan.md or a ticket still has placeholders, or a [slug] stub remains (${writeTarget.existingStubs.join(', ') || 'no ticket files'}).`,
      'Finish filling 02-plan/ and delete the stubs, then run this again.'
    );
  }

  const { tickets, skipped } = listTickets(sessionDir);
  for (const fileName of skipped) {
    console.error(`⚠️  Skipped ${fileName}: ticket files must be named NN-<slug>.md`);
  }
  if (tickets.length === 0) {
    throw new GpsError('The plan has no valid ticket files.', 'Write at least one 02-plan/tickets/NN-<slug>.md.');
  }
  console.log(`✅ Plan written for ${sessionId}: ${tickets.length} ticket(s). Next: /gps ship`);
});
