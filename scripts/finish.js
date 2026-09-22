#!/usr/bin/env node

/**
 * /gps finish
 *
 * Closes the current session: writes INDEX.md (session summary), records
 * finished_at in .session-config.json, clears .current-session, and lists
 * the sessions still unfinished so Claude can offer to switch to one
 * (via set-current.js, after the user confirms).
 *
 * Refuses (changing nothing) when:
 * - the session is already finished;
 * - the grill or plan phase is not written yet;
 * - any ticket is not Done.
 * A bounded session (resume written, no plan) may finish with no tickets.
 */

const fs = require('fs');
const path = require('path');
const {
  resolveSession, isFinished, clearCurrentSession, listUnfinishedSessions,
} = require('./lib/session-store');
const { resolveWriteTarget } = require('./lib/write-target');
const { listTickets } = require('./lib/ticket-queue');
const { GpsError, writeJsonAtomic, runCli } = require('./lib/guard');

function buildIndex(config, finishedAt, tickets, bounded) {
  const lines = [
    `# Session Summary: ${config.feature_name}`,
    '',
    `**Session ID:** ${config.session_id}`,
    `**Created:** ${config.created_at}`,
    `**Finished:** ${finishedAt}`,
    `**Status:** Complete${bounded ? ' (bounded: no plan or tickets)' : ''}`,
    '',
    '## Grill',
    '',
    '- Resume: [01-grill/resume.md](01-grill/resume.md)',
    '',
  ];
  if (!bounded) {
    lines.push(
      '## Plan',
      '',
      '- Plan: [02-plan/plan.md](02-plan/plan.md)',
      '',
      '## Tickets',
      '',
      ...tickets.map((t) =>
        `- ✅ ${t.num} ${t.slug} — [spec](02-plan/tickets/${path.basename(t.ticketPath)}) · ` +
        `[log](03-implement/${t.num}-${t.slug}/commit-log.md)`),
      ''
    );
  }
  lines.push('## Next', '', 'Start a new feature with /gps start <next-feature>', '');
  return lines.join('\n');
}

function finishSession() {
  const { sessionsDir, sessionId, sessionDir, configPath, config } = resolveSession(process.cwd());

  if (isFinished(config)) {
    throw new GpsError(`Session ${sessionId} is already finished; nothing was changed.`,
      'Run /gps status to pick another session, or /gps start <feature-name>.');
  }

  const writeTarget = resolveWriteTarget(sessionDir);
  if (writeTarget.target === 'grill') {
    throw new GpsError('The grill phase is not written yet; nothing was changed.', 'Run /gps write first.');
  }
  if (writeTarget.target === 'plan') {
    throw new GpsError('The plan and tickets are not written yet; nothing was changed.', 'Run /gps write, then /gps ship.');
  }

  const bounded = writeTarget.reason === 'plan-not-started';
  const { tickets } = listTickets(sessionDir);
  const pending = tickets.filter((t) => !t.done);
  if (pending.length > 0) {
    throw new GpsError(
      `${pending.length} of ${tickets.length} ticket(s) not Done: ${pending.map((t) => `${t.num}-${t.slug}`).join(', ')}. Nothing was changed.`,
      'Run /gps ship to finish them.'
    );
  }

  const finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(sessionDir, 'INDEX.md'), buildIndex(config, finishedAt, tickets, bounded));

  config.finished_at = finishedAt;
  writeJsonAtomic(configPath, config);

  clearCurrentSession(sessionsDir);

  console.log(`✅ Session complete: ${sessionId}`);
  console.log(`Summary: ${path.join(sessionDir, 'INDEX.md')}`);

  const unfinished = listUnfinishedSessions(sessionsDir);
  console.log(`\nUNFINISHED_SESSIONS ${JSON.stringify(unfinished)}`);
  if (unfinished.length > 0) {
    console.log(`\n${unfinished.length} unfinished session(s) remain. Ask the user whether to switch to one;`);
    console.log('if they say yes, run: node $CLAUDE_PLUGIN_ROOT/scripts/set-current.js <session-id>');
  } else {
    console.log('\nNo unfinished sessions. Start a new feature with /gps start <feature-name>.');
  }
}

runCli(finishSession);
