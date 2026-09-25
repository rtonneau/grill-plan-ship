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
 *
 * INDEX.md gets a "## Timeline" built from the session history (see
 * lib/history.js) plus the session_finished event, which is recorded after
 * INDEX.md is written.
 *
 * Sessions with a branch (`git` in the config, set by /gps write in a
 * GitHub project) must have it checked out; finish pushes it and opens a
 * PR against its base branch. A failed push or gh call does not fail the
 * finish: INDEX.md and the output list the commands to run by hand.
 */

const fs = require('fs');
const path = require('path');
const {
  resolveSession, isFinished, clearCurrentSession, listUnfinishedSessions,
} = require('./lib/session-store');
const { resolveWriteTarget } = require('./lib/write-target');
const { listTickets } = require('./lib/ticket-queue');
const { splitSections } = require('./lib/write-payload');
const {
  PR_ATTRIBUTION, currentBranch, branchType, commitsBetween, hasUncommittedChanges, openPullRequest,
} = require('./lib/github');
const { GpsError, writeJsonAtomic, runCli } = require('./lib/guard');
const { getHistory, renderTimeline, recordEvent } = require('./lib/history');

function buildIndex(config, finishedAt, tickets, bounded, pr, events) {
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
  if (config.git) lines.push(...branchSection(config.git, pr));
  lines.push(...renderTimeline(events));
  lines.push('## Next', '', 'Start a new feature with /gps start <next-feature>', '');
  return lines.join('\n');
}

function branchSection(gitInfo, pr) {
  const lines = [
    '## Branch & PR',
    '',
    `- **Branch:** \`${gitInfo.branch}\``,
    `- **Base:** \`${gitInfo.base_branch}\``,
  ];
  if (pr.ok) {
    lines.push(`- **Pull request:** ${pr.url}`, '');
  } else {
    lines.push(
      `- **Pull request:** not opened (${pr.step === 'push' ? 'push' : 'gh pr create'} failed: ${pr.reason})`,
      '',
      'Open it by hand:',
      '',
      '```bash',
      ...pr.commands,
      '```',
      ''
    );
  }
  return lines;
}

// "## Problem Statement" of the resume, or null.
function problemStatement(sessionDir) {
  try {
    const text = fs.readFileSync(path.join(sessionDir, '01-grill', 'resume.md'), 'utf-8');
    const section = splitSections(text).sections.find((s) => s.heading === 'Problem Statement');
    return section && section.body ? section.body : null;
  } catch (_err) {
    return null;
  }
}

function buildPrBody(projectRoot, sessionDir, config, tickets, bounded) {
  const { branch, base_branch: base } = config.git;
  const commits = commitsBetween(projectRoot, base, branch);
  const lines = [
    '## Summary',
    '',
    problemStatement(sessionDir) || config.feature_name,
    '',
    '## Tickets',
    '',
    ...(bounded
      ? ['Bounded session: no plan or tickets.']
      : tickets.map((t) => `- [x] ${t.num} ${t.slug}`)),
    '',
    '## Commits',
    '',
    ...(commits.length > 0 ? commits.map((c) => `- ${c}`) : ['None.']),
    '',
    `gps session: \`${config.session_id}\``,
    '',
    PR_ATTRIBUTION,
    '',
  ];
  return lines.join('\n');
}

// Pushes the session branch and opens its PR (GitHub sessions only).
function openSessionPr(projectRoot, sessionDir, config, tickets, bounded) {
  const title = `${branchType(config.git.branch)}: ${config.feature_name}`;
  const body = buildPrBody(projectRoot, sessionDir, config, tickets, bounded);
  return openPullRequest(projectRoot, config.git, { title, body });
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

  const projectRoot = process.cwd();
  let pr = null;
  if (config.git) {
    const onBranch = currentBranch(projectRoot);
    if (onBranch !== config.git.branch) {
      throw new GpsError(
        `The session's work is on branch ${config.git.branch}, but ${onBranch || 'a detached HEAD'} is checked out. Nothing was changed.`,
        `Run git switch ${config.git.branch}, then /gps finish again.`
      );
    }
    if (hasUncommittedChanges(projectRoot)) {
      console.error('⚠️  Uncommitted changes to tracked files will not be in the pull request.');
    }
    pr = openSessionPr(projectRoot, sessionDir, config, tickets, bounded);
    if (pr.ok) {
      // Saved at once, so a finish interrupted after this point reuses the
      // PR on its next run instead of opening a second one.
      config.git.pr_url = pr.url;
      writeJsonAtomic(configPath, config);
    }
  }

  const finishedAt = new Date().toISOString();
  const events = [
    ...getHistory(config),
    { at: finishedAt, event: 'session_finished', phase: 'finished', files: ['INDEX.md'] },
  ];
  fs.writeFileSync(path.join(sessionDir, 'INDEX.md'), buildIndex(config, finishedAt, tickets, bounded, pr, events));

  config.finished_at = finishedAt;
  writeJsonAtomic(configPath, config);
  recordEvent(configPath, config, sessionDir, { event: 'session_finished', files: ['INDEX.md'], at: finishedAt });

  clearCurrentSession(sessionsDir);

  console.log(`✅ Session complete: ${sessionId}`);
  console.log(`Summary: ${path.join(sessionDir, 'INDEX.md')}`);
  if (pr && pr.ok) {
    console.log(`🔀 Pull request${pr.existing ? ' (already open, updated by the push)' : ''}: ${pr.url}`);
  } else if (pr) {
    console.error(`⚠️  Pull request not opened (${pr.step === 'push' ? 'git push' : 'gh pr create'} failed: ${pr.reason}). Run by hand:`);
    for (const command of pr.commands) console.error(`   ${command}`);
  }

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
