#!/usr/bin/env node

/**
 * /gps handoff
 *
 * Saves a checkpoint of the current session's in-flight state before
 * stopping work: auto-fills everything derivable from disk/git into
 * HANDOFF.md (phase, active ticket, ticket queue, recent commits,
 * uncommitted files), then leaves narrative placeholders for Claude Code
 * to fill in directly (where work stopped, reasoning so far, next step,
 * open questions, settled decisions, why anything is uncommitted).
 *
 * Single file per session — each run overwrites the previous HANDOFF.md.
 */

const fs = require('fs');
const path = require('path');
const { loadTemplate, renderTemplate } = require('./lib/templates');
const { resolveSession } = require('./lib/session-store');
const { buildHandoffData } = require('./lib/handoff');
const { runCli } = require('./lib/guard');
const { recordEvent } = require('./lib/history');

function formatGitStatus(gitStatus) {
  if (gitStatus.length === 0) return 'clean';
  return gitStatus.map((e) => `${e.indexStatus}${e.worktreeStatus} ${e.path}`).join(', ');
}

function formatList(items, emptyText) {
  return items.length === 0 ? emptyText : items.join(', ');
}

function main() {
  const projectRoot = process.cwd();
  const { sessionDir, configPath, config } = resolveSession(projectRoot);
  const data = buildHandoffData(sessionDir, projectRoot);

  const rendered = renderTemplate(loadTemplate('handoff.md'), {
    'feature-name': data.featureName,
    'session-id': data.sessionId,
    timestamp: data.timestamp,
    'current-phase': data.currentPhase,
    'active-ticket': data.activeTicket || 'none',
    'git-status-project': formatGitStatus(data.gitStatus.project),
    'git-status-session': formatGitStatus(data.gitStatus.session),
    'ticket-queue-summary': formatList(data.ticketQueueSummary, 'no tickets yet'),
    'git-log': formatList(data.gitLog, 'no commits yet'),
  });

  const handoffPath = path.join(sessionDir, 'HANDOFF.md');
  fs.writeFileSync(handoffPath, rendered);
  recordEvent(configPath, config, sessionDir, { event: 'handoff_saved', files: ['HANDOFF.md'] });

  console.log(`✅ Handoff saved: ${handoffPath}`);
  console.log(JSON.stringify(data, null, 2));
  console.log(
    '\nFill in the remaining sections directly in HANDOFF.md before ending this session: ' +
    'Where I Stopped, Reasoning So Far, Next Step, Open Questions, Settled Decisions, ' +
    'and Why Not Committed (only if git status above is not "clean").'
  );
}

runCli(main);
