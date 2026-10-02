#!/usr/bin/env node

/**
 * handoff.js [--json]
 *
 * /gps handoff: saves a checkpoint of the current session before stopping
 * work. Writes HANDOFF.md at the session root with everything derivable
 * from disk and git (phase, active ticket, ticket queue, recent commits,
 * uncommitted files) and gps:fill markers for the narrative Claude then
 * fills in directly. Each run overwrites the previous HANDOFF.md.
 * /gps status reads it back.
 */

const fs = require('fs');
const path = require('path');
const { main } = require('./lib/cli');
const { loadTemplate, renderTemplate } = require('./lib/templates');
const { resolveSession } = require('./lib/session-store');
const { HANDOFF_FILENAME, buildHandoffData } = require('./lib/handoff');
const { recordEvent } = require('./lib/history');

const NARRATIVE = ['Where I Stopped', 'Reasoning So Far', 'Next Step', 'Open Questions', 'Settled Decisions'];

function formatGitStatus(entries) {
  return entries.length === 0 ? 'clean' : entries.map((e) => `${e.indexStatus}${e.worktreeStatus} ${e.path}`).join(', ');
}

const formatList = (items, emptyText) => (items.length === 0 ? emptyText : items.join(', '));

main({
  usage: 'handoff.js [--json]',
  run({ projectRoot }) {
    const { sessionDir, configPath, config } = resolveSession(projectRoot);
    const data = buildHandoffData(sessionDir, projectRoot);
    const project = formatGitStatus(data.gitStatus.project);
    const session = formatGitStatus(data.gitStatus.session);
    const clean = project === 'clean' && session === 'clean';

    const handoffPath = path.join(sessionDir, HANDOFF_FILENAME);
    fs.writeFileSync(handoffPath, renderTemplate(loadTemplate('handoff.md'), {
      'feature-name': data.featureName,
      'session-id': data.sessionId,
      timestamp: data.timestamp,
      'current-phase': data.currentPhase,
      'active-ticket': data.activeTicket || 'none',
      'git-status-project': project,
      'git-status-session': session,
      'why-not-committed': clean ? 'n/a' : '<!-- gps:fill why the changes above are not committed yet -->',
      'ticket-queue-summary': formatList(data.ticketQueueSummary, 'no tickets yet'),
      'git-log': formatList(data.gitLog, 'no commits yet'),
    }));
    recordEvent(configPath, config, sessionDir, { event: 'handoff_saved', files: [HANDOFF_FILENAME] });

    const toFill = [...NARRATIVE, ...(clean ? [] : ['Why not committed'])];
    return {
      text: [
        `✅ Handoff saved: ${handoffPath}`,
        `Phase ${data.currentPhase}, active ticket ${data.activeTicket || 'none'}, git ${clean ? 'clean' : 'has uncommitted changes'}.`,
        `Next: replace the gps:fill markers of these sections in HANDOFF.md (Edit): ${toFill.join(', ')}.`,
      ].join('\n'),
      data: { handoffPath, toFill, ...data },
    };
  },
});
