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
 * Sessions with a branch (`git` in the config, set by the plan write in a
 * GitHub project) must have it checked out; finish pushes it and opens a
 * PR against its base branch. A failed push or gh call does not fail the
 * finish: INDEX.md and the output list the commands to run by hand.
 * Bounded sessions have no branch, so they open no PR.
 *
 * Sessions filed with /gps issue (`issue` in the config): without a branch
 * (bounded), finish comments a summary on the GitHub issue and, with
 * `--close-issue`, closes it. With a branch, the PR body says "Closes #N"
 * and merging the PR closes the issue. A failed gh call never fails finish.
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
  commentOnIssue, closeIssue,
} = require('./lib/github');
const { readRecentCommits } = require('./lib/git');
const { GpsError, writeJsonAtomic, runCli } = require('./lib/guard');
const { getHistory, hasEvent, renderTimeline, recordEvent } = require('./lib/history');

function buildIndex(config, finishedAt, tickets, bounded, pr, events, issueResult) {
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
  if (config.issue) lines.push(...issueSection(config, issueResult));
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
  const closeRequested = process.argv.slice(2).includes('--close-issue');
  const boundedIssue = Boolean(config.issue) && !config.git;
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
      if (!hasEvent(config, 'pr_opened')) {
        recordEvent(configPath, config, sessionDir, { event: 'pr_opened', files: ['INDEX.md'], detail: { url: pr.url } });
      }
    }
  }

  let issueResult = null;
  if (boundedIssue) {
    issueResult = wrapUpIssue(projectRoot, sessionDir, configPath, config, closeRequested);
  } else if (closeRequested) {
    console.error(`⚠️  --close-issue ignored: ${config.issue
      ? 'the pull request closes the issue when it is merged.'
      : 'this session has no GitHub issue.'}`);
  }

  const finishedAt = new Date().toISOString();
  const events = [
    ...getHistory(config),
    { at: finishedAt, event: 'session_finished', phase: 'finished', files: ['INDEX.md'] },
  ];
  fs.writeFileSync(path.join(sessionDir, 'INDEX.md'), buildIndex(config, finishedAt, tickets, bounded, pr, events, issueResult));

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
  if (issueResult) {
    const number = config.issue.number;
    if (issueResult.commented) console.log(`💬 Summary posted on issue #${number}: ${config.issue.url}`);
    if (issueResult.closed) console.log(`✅ Issue #${number} closed`);
    for (const failure of issueResult.failures) {
      console.error(`⚠️  Issue #${number}: ${failure.step} failed (${failure.reason}). Run by hand:`);
      for (const command of failure.commands) console.error(`   ${command}`);
    }
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
