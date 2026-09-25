#!/usr/bin/env node

/**
 * /gps write, step 3
 *
 * Applies the payload Claude wrote to <sessionDir>/.write-payload.md:
 * checks it against the pending phase's headings, fills resume.md or
 * plan.md (with a generated Token Usage section), writes the plan's
 * NN-<slug>.md tickets and removes the [slug] stubs, then deletes the
 * payload. Writes nothing unless every check passes.
 *
 * Plan phase in a GitHub project (github.enabled in .work/gps-config.json),
 * for a session without a branch yet: also creates the session branch named
 * by the payload's "**Branch:**" field (from the current HEAD) and records
 * it in .session-config.json as `git`, for /gps finish to open the PR.
 * Bounded sessions (no plan) never get a branch.
 *
 * Grill phase of a `kind: "issue"` session (/gps issue) in a GitHub project:
 * also files the GitHub issue from the resume sections and records it in
 * .session-config.json as `issue`. If gh fails nothing is written.
 */

const fs = require('fs');
const path = require('path');
const { resolveSession } = require('./lib/session-store');
const { resolveWriteTarget, placeholderTester, checkPlanWritten } = require('./lib/write-target');
const { computeUsage } = require('./lib/token-usage');
const { recordEvent, sessionPath } = require('./lib/history');
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
const { validateBranchName, createSessionBranch, createIssue, buildIssueBody } = require('./lib/github');
const { githubEnabled } = require('./lib/project-config');
const { GpsError, writeJsonAtomic, runCli } = require('./lib/guard');

const NOTHING_PENDING_HINT = {
  'plan-not-started': 'Run /gps plan first.',
  complete: 'Both phases are written. Run /gps status for the next command.',
};

runCli(() => {
  const { sessionId, sessionDir, configPath, config } = resolveSession(process.cwd());
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
  const isUnfilled = placeholderTester(sessionDir);
  const errors = validatePayload(payload, {
    expectedHeadings: expectedHeadings(current),
    expectedFields: expectedFields(current),
    phase: target,
    isUnfilled,
  });

  const targetPath = phaseFilePath(sessionDir, target);
  const rendered = renderPhaseFile(current, payload.sections, computeUsage(config, target), payload.fields);
  if (errors.length === 0 && isUnfilled(rendered)) {
    errors.push(`${path.basename(targetPath)} would still have a placeholder outside the payload's reach (e.g. a hand-edited header line). Remove it from ${targetPath} by hand.`);
  }

  const projectRoot = process.cwd();
  const branch = target === 'plan' && !config.git && githubEnabled(projectRoot) ? payload.fields.Branch || '' : null;
  if (branch !== null) errors.push(...validateBranchName(projectRoot, branch));
  const issueWanted = target === 'grill' && config.kind === 'issue' && !config.issue && githubEnabled(projectRoot);

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

  // The branch is created first: if git refuses, nothing is written.
  let gitInfo = null;
  if (branch) {
    try {
      gitInfo = createSessionBranch(projectRoot, branch);
    } catch (err) {
      throw new GpsError(`${err.message} (nothing was written).`,
        `Fix the problem (or change "**Branch:**" in ${payloadPath}) and run write-apply.js again.`);
    }
    // Recorded at once: if a later write fails, the retry sees config.git and
    // skips the branch instead of failing on a branch that already exists.
    config.git = gitInfo;
    writeJsonAtomic(configPath, config);
    recordEvent(configPath, config, sessionDir, {
      event: 'branch_created',
      detail: { branch: gitInfo.branch, base: gitInfo.base_branch },
      at: gitInfo.branch_created_at,
    });
  }

  // Same rule for the issue: if gh refuses, nothing is written.
  let issue = null;
  if (issueWanted) {
    try {
      issue = createIssue(projectRoot, { title: config.feature_name, body: buildIssueBody(payload.sections, sessionId) });
    } catch (err) {
      throw new GpsError(`${err.message} (nothing was written).`,
        `Fix the problem (check that gh is installed and logged in) and run write-apply.js again.`);
    }
    // Recorded at once: if resume.md then fails to write, the retry sees
    // config.issue and files no second issue.
    config.issue = issue;
    writeJsonAtomic(configPath, config);
    recordEvent(configPath, config, sessionDir, {
      event: 'issue_created',
      files: ['01-grill/resume.md'],
      detail: { number: issue.number, url: issue.url },
      at: issue.created_at,
    });
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, rendered);

  if (target === 'grill') {
    recordEvent(configPath, config, sessionDir, { event: 'grill_written', files: ['01-grill/resume.md'] });
    fs.unlinkSync(payloadPath);
    console.log(`✅ Grill written for ${sessionId}. Next: /gps plan`);
    if (issue) console.log(`📌 Issue #${issue.number}: ${issue.url}`);
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
  recordEvent(configPath, config, sessionDir, {
    event: 'plan_written',
    files: ['02-plan/plan.md', ...tickets.map((t) => sessionPath(sessionDir, t.ticketPath))],
    detail: { tickets: tickets.length },
  });
  fs.unlinkSync(payloadPath);
  console.log(`✅ Plan written for ${sessionId}: ${tickets.length} ticket(s). Next: /gps ship`);
  if (gitInfo) console.log(`🌿 Working on branch ${gitInfo.branch} (from ${gitInfo.base_branch}); /gps finish opens the PR.`);
});
