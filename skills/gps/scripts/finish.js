#!/usr/bin/env node

/**
 * finish.js [--close-issue | --keep-issue] [--json]
 *
 * /gps finish: closes the current session: writes INDEX.md (session
 * summary), records finished_at in .session-config.json, clears
 * .current-session, and lists the sessions still unfinished so Claude can
 * offer to switch to one (set-current.js, after the user confirms).
 *
 * Refuses (changing nothing) when:
 * - the session is already finished;
 * - the grill or plan phase is not written yet;
 * - any ticket is not Done;
 * - a GitHub session's branch is not checked out;
 * - a bounded issue session gets neither --close-issue nor --keep-issue
 *   (the user's answer to "close issue #N as well?").
 * A bounded session (resume written, no plan) may finish with no tickets.
 *
 * Changes to tracked files still uncommitted (e.g. a log a hook appends to)
 * are committed first, on the checked-out branch; untracked files are only
 * listed. Sessions with a branch (`git` in the config, set by the plan write
 * in a GitHub project) are pushed, get a PR against their base branch (an
 * existing one is reused), then the base branch is checked out again (not
 * after a failed commit, which would leave changes behind). A failed commit,
 * push, gh call or switch does not fail the finish: INDEX.md and the output
 * list the commands to run by hand.
 *
 * Issue sessions (`issue` in the config): without a branch (bounded),
 * finish comments a summary on the issue and, with --close-issue, closes
 * it. With a branch, the PR body says "Closes #N".
 */

const fs = require('fs');
const path = require('path');
const { main } = require('./lib/cli');
const { resolveSession, clearCurrentSession, listUnfinishedSessions, SET_CURRENT } = require('./lib/session-store');
const { isFinished } = require('./lib/phase');
const { resolveWriteTarget } = require('./lib/write-target');
const { listTickets } = require('./lib/ticket-queue');
const { splitSections } = require('./lib/write-payload');
const {
  currentBranch, branchType, commitsBetween, commitRemainingChanges, switchBranch, readRecentCommits,
} = require('./lib/git');
const { PR_ATTRIBUTION, openPullRequest, commentOnIssue, closeIssue } = require('./lib/github');
const { GpsError, UsageError, writeJsonAtomic } = require('./lib/guard');
const { getHistory, hasEvent, renderTimeline, recordEvent } = require('./lib/history');

function buildIndex(config, finishedAt, tickets, bounded, pr, events, issueResult, leftover) {
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
  if (leftover.sha || !leftover.ok) lines.push(...leftoverSection(leftover));
  if (config.git) lines.push(...branchSection(config.git, pr));
  if (config.issue) lines.push(...issueSection(config, issueResult));
  lines.push(...renderTimeline(events));
  lines.push('## Next', '', 'Start a new feature with /gps start <next-feature>', '');
  return lines.join('\n');
}

function leftoverSection(leftover) {
  const lines = ['## Remaining changes', ''];
  if (leftover.ok) {
    const files = leftover.files.map((f) => `\`${f}\``).join(', ');
    lines.push(`Committed by /gps finish (\`${leftover.sha}\`): ${files}`, '');
  } else {
    lines.push(`Not committed (${leftover.reason}). Commit them by hand:`, '', '```bash', ...leftover.commands, '```', '');
  }
  return lines;
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

function issueSection(config, result) {
  const lines = ['## Issue', '', `- **Issue:** ${config.issue.url}`];
  if (config.git) {
    lines.push('- **Closed by:** the pull request, when it is merged', '');
    return lines;
  }
  lines.push(
    `- **Summary comment:** ${result.commented ? 'posted' : 'not posted'}`,
    `- **Closed:** ${result.closed ? 'yes' : 'no'}`
  );
  if (result.failures.length > 0) {
    lines.push('', 'Run by hand:', '', '```bash', ...result.failures.flatMap((f) => f.commands), '```');
  }
  lines.push('');
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
    ...(config.issue ? [`Closes #${config.issue.number}`, ''] : []),
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

function buildIssueComment(projectRoot, sessionDir, config) {
  const commits = readRecentCommits(projectRoot, config.created_at, 50);
  return [
    '## Session finished',
    '',
    problemStatement(sessionDir) || config.feature_name,
    '',
    '## Commits',
    '',
    ...(commits.length > 0 ? commits.map((c) => `- ${c}`) : ['None.']),
    '',
    `gps session: \`${config.session_id}\``,
    '',
    PR_ATTRIBUTION,
    '',
  ].join('\n');
}

// Bounded issue session: comments once and (on request) closes the issue.
// Each success is saved at once, so an interrupted finish never repeats it.
// Returns { commented, closed, failures: [{ step, reason, commands }] }.
function wrapUpIssue(projectRoot, sessionDir, configPath, config, close) {
  const issue = config.issue;
  const result = { commented: Boolean(issue.commented), closed: Boolean(issue.closed), failures: [] };

  if (!result.commented) {
    const commented = commentOnIssue(projectRoot, issue.number, buildIssueComment(projectRoot, sessionDir, config));
    if (commented.ok) {
      issue.commented = true;
      result.commented = true;
      writeJsonAtomic(configPath, config);
      recordEvent(configPath, config, sessionDir, { event: 'issue_commented', detail: { number: issue.number } });
    } else {
      result.failures.push({ step: 'comment', ...commented });
    }
  }
  if (close && !result.closed) {
    const closed = closeIssue(projectRoot, issue.number);
    if (closed.ok) {
      issue.closed = true;
      result.closed = true;
      writeJsonAtomic(configPath, config);
      recordEvent(configPath, config, sessionDir, { event: 'issue_closed', detail: { number: issue.number } });
    } else {
      result.failures.push({ step: 'close', ...closed });
    }
  }
  return result;
}

// Refuses, changing nothing, unless the session can be finished.
function checkFinishable(projectRoot, sessionId, sessionDir, config, options) {
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
  const { tickets } = listTickets(sessionDir);
  const pending = tickets.filter((t) => !t.done);
  if (pending.length > 0) {
    throw new GpsError(
      `${pending.length} of ${tickets.length} ticket(s) not Done: ${pending.map((t) => `${t.num}-${t.slug}`).join(', ')}. Nothing was changed.`,
      'Run /gps ship to finish them.'
    );
  }
  if (config.git) {
    const onBranch = currentBranch(projectRoot);
    if (onBranch !== config.git.branch) {
      throw new GpsError(
        `The session's work is on branch ${config.git.branch}, but ${onBranch || 'a detached HEAD'} is checked out. Nothing was changed.`,
        `Run git switch ${config.git.branch}, then /gps finish again.`
      );
    }
  }
  if (config.issue && !config.git && !options['close-issue'] && !options['keep-issue']) {
    throw new GpsError(`Session ${sessionId} reports issue #${config.issue.number}; nothing was changed.`,
      `Ask the user "Close issue #${config.issue.number} as well?", then run finish.js --close-issue (yes) or --keep-issue (no).`);
  }
  return { tickets, bounded: writeTarget.reason === 'plan-not-started' };
}

function finishSession({ options, projectRoot, warn }) {
  if (options['close-issue'] && options['keep-issue']) throw new UsageError('Use --close-issue or --keep-issue, not both.');
  const { sessionsDir, sessionId, sessionDir, configPath, config } = resolveSession(projectRoot);
  const { tickets, bounded } = checkFinishable(projectRoot, sessionId, sessionDir, config, options);
  const boundedIssue = Boolean(config.issue) && !config.git;
  if (!boundedIssue && (options['close-issue'] || options['keep-issue'])) {
    warn(`--${options['close-issue'] ? 'close' : 'keep'}-issue ignored: ${config.issue
      ? 'the pull request closes the issue when it is merged.'
      : 'this session has no GitHub issue.'}`);
  }

  // Before the push, so the leftovers are in the pull request.
  const leftover = commitRemainingChanges(projectRoot, `chore: commit remaining changes (gps finish ${sessionId})`);

  let pr = null;
  if (config.git) {
    pr = openSessionPr(projectRoot, sessionDir, config, tickets, bounded);
    if (pr.ok) {
      // Saved at once, so a finish interrupted after this point reuses the
      // PR on its next run instead of opening a second one.
      config.git.pr_url = pr.url;
      writeJsonAtomic(configPath, config);
      if (!hasEvent(config, 'pr_opened')) {
        recordEvent(configPath, config, sessionDir, { event: 'pr_opened', detail: { url: pr.url } });
      }
    }
  }

  const issueResult = boundedIssue ? wrapUpIssue(projectRoot, sessionDir, configPath, config, options['close-issue']) : null;

  const finishedAt = new Date().toISOString();
  const events = [
    ...getHistory(config),
    { at: finishedAt, event: 'session_finished', phase: 'finished', files: ['INDEX.md'] },
  ];
  const indexPath = path.join(sessionDir, 'INDEX.md');
  fs.writeFileSync(indexPath, buildIndex(config, finishedAt, tickets, bounded, pr, events, issueResult, leftover));

  config.finished_at = finishedAt;
  writeJsonAtomic(configPath, config);
  recordEvent(configPath, config, sessionDir, { event: 'session_finished', files: ['INDEX.md'], at: finishedAt });
  clearCurrentSession(sessionsDir);

  // Last, once every session file is written. Not after a failed commit: the
  // changes it left would be carried over to (or block) the switch.
  let back = null;
  if (config.git && leftover.ok) {
    const base = config.git.base_branch;
    back = base
      ? { base, ...switchBranch(projectRoot, base) }
      : { base, ok: false, reason: 'no base branch was recorded', commands: [] };
  }

  const lines = [`✅ Session complete: ${sessionId}`, `Summary: ${indexPath}`];
  const byHand = (message, commands) => {
    warn(`${message}${commands.length > 0 ? ' Run by hand:' : ''}`);
    for (const command of commands) console.error(`   ${command}`);
  };
  if (leftover.sha) {
    lines.push(`📦 Committed ${leftover.files.length} remaining file(s) (${leftover.sha}): ${leftover.files.join(', ')}`);
  } else if (!leftover.ok) {
    byHand(`Remaining changes not committed (${leftover.reason}).`, leftover.commands);
  }
  if (leftover.untracked.length > 0) warn(`Untracked files left uncommitted: ${leftover.untracked.join(', ')}`);
  if (pr && pr.ok) {
    lines.push(`🔀 Pull request${pr.existing ? ' (already open, updated by the push)' : ''}: ${pr.url}`);
  } else if (pr) {
    byHand(`Pull request not opened (${pr.step === 'push' ? 'git push' : 'gh pr create'} failed: ${pr.reason}).`, pr.commands);
  }
  if (back && back.ok) {
    lines.push(`↩️  Back on ${back.base}: ${pr.ok ? 'merge the pull request' : 'open the pull request with the commands above, merge it'}, then git pull`);
  } else if (back) {
    byHand(`Still on ${config.git.branch}: switching to the base branch failed (${back.reason}).`, back.commands);
  } else if (config.git) {
    warn(`Still on ${config.git.branch}: commit the remaining changes, then git switch ${config.git.base_branch}.`);
  }
  if (issueResult) {
    const number = config.issue.number;
    if (issueResult.commented) lines.push(`💬 Summary posted on issue #${number}: ${config.issue.url}`);
    if (issueResult.closed) lines.push(`✅ Issue #${number} closed`);
    for (const failure of issueResult.failures) byHand(`Issue #${number}: ${failure.step} failed (${failure.reason}).`, failure.commands);
  }

  const unfinished = listUnfinishedSessions(sessionsDir);
  lines.push('', unfinished.length > 0
    ? `Unfinished sessions: ${unfinished.map((s) => s.sessionId).join(', ')}. Next: ask the user whether to switch to one (${SET_CURRENT}).`
    : 'No unfinished sessions. Next: /gps start <feature-name>.');

  return {
    text: lines.join('\n'),
    data: {
      sessionId, indexPath, finishedAt, leftover, pr, back, issue: issueResult,
      unfinished: unfinished.map((s) => s.sessionId),
    },
  };
}

main({
  usage: 'finish.js [--close-issue | --keep-issue] [--json]',
  options: { 'close-issue': 'boolean', 'keep-issue': 'boolean' },
  run: finishSession,
});
