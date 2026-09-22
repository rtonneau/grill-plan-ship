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

function formatGitStatus(gitStatus) {
  if (gitStatus.length === 0) return 'clean';
  return gitStatus.map((e) => `${e.indexStatus}${e.worktreeStatus} ${e.path}`).join(', ');
}

function formatList(items, emptyText) {
  return items.length === 0 ? emptyText : items.join(', ');
}

function main() {
  const projectRoot = process.cwd();
  const { sessionDir } = resolveSession(projectRoot);
  const data = buildHandoffData(sessionDir, projectRoot);

  const rendered = renderTemplate(loadTemplate('handoff.md'), {
    'feature-name': data.featureName,
    'session-id': data.sessionId,
    timestamp: data.timestamp,
    'current-phase': data.currentPhase,
    'active-ticket': data.activeTicket || 'none',
    'git-status-summary': formatGitStatus(data.gitStatus),
    'ticket-queue-summary': formatList(data.ticketQueueSummary, 'no tickets yet'),
    'git-log': formatList(data.gitLog, 'no commits yet'),
  });

  const handoffPath = path.join(sessionDir, 'HANDOFF.md');
  fs.writeFileSync(handoffPath, rendered);

  console.log(`✅ Handoff saved: ${handoffPath}`);
  console.log(JSON.stringify(data, null, 2));
  console.log(
    '\nFill in the remaining sections directly in HANDOFF.md before ending this session: ' +
    'Where I Stopped, Reasoning So Far, Next Step, Open Questions, Settled Decisions, ' +
    'and Why Not Committed (only if git status above is not "clean").'
  );
}

runCli(main);
