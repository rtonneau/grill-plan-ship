#!/usr/bin/env node

/**
 * start.js <feature-name...> [--issue] [--worktree [--path <dir>] [--branch <name>]] [--json]
 *
 * /gps start: creates the session (directory, resume template, scratch dir,
 * .scratch/ in .gitignore, .current-session, which is committed with .work/) and records GitHub detection in
 * .work/gps-config.json the first time. With --issue the session is a
 * report (kind "issue"): on a GitHub project the grill write files it as
 * a GitHub issue; otherwise a warning says it stays local.
 *
 * An unfinished session whose id is <any date>__<slug> (the newest, if
 * several) is resumed instead: start writes nothing and prints where it
 * stands (phase, tickets, idleness, whether it is current) and its next
 * command; switching to it is left to set-current.js after the user agrees.
 *
 * A scouted seed whose slug matches the session's is consumed: printed as
 * the grill's starting context and removed from .pending-seeds.json.
 * With --worktree the session gets its own linked git worktree on a new
 * session branch (default <type>/<slug> at ../<repo>-worktrees/<session-id>),
 * and is created there: one session per worktree runs in parallel with the
 * others. Every problem is checked before git or the session writes anything.
 * Warns when .work/ is git-ignored (gps then commits none of its files),
 * and suggests /gps init while the project's gps setup is not committed.
 */

const path = require('path');
const { main } = require('./lib/cli');
const { ensureProjectConfig } = require('./lib/project-config');
const { initSession } = require('./lib/session-init');
const { sessionsDirOf, findUnfinishedBySlug, readCurrentPointer, readConfigOrNull } = require('./lib/session-store');
const { computeSessionState } = require('./lib/phase');
const { computeIdleness } = require('./lib/staleness');
const { getSeed, removeSeed } = require('./lib/seeds-store');
const { isWorkTree, isIgnored, isCommitted, worktreeProblems, addWorktree, worktreeRoot } = require('./lib/git');
const { needsSetup } = require('./lib/setup');
const { recordEvent } = require('./lib/history');
const { GpsError, UsageError, slugify, localDate, readJson } = require('./lib/guard');

// --worktree: validates, then creates the worktree and its branch. Returns
// { root, gitInfo } (root: where the session is created).
function prepareWorktree(projectRoot, featureName, options) {
  const now = new Date();
  const slug = slugify(featureName, now);
  const sessionId = `${localDate(now)}__${slug}`;
  const branch = options.branch || `${options.issue ? 'fix' : 'feat'}/${slug.replace(/_/g, '-')}`;
  const worktreePath = path.resolve(projectRoot, options.path || path.join(worktreeRoot(projectRoot), sessionId));
  const problems = worktreeProblems(projectRoot, worktreePath, branch);
  if (isWorkTree(projectRoot) && !isCommitted(projectRoot, '.work/gps-config.json')) {
    problems.push('.work/gps-config.json is not committed on this branch. Run /gps init here first, so every worktree session shares it.');
  }
  if (problems.length > 0) {
    throw new GpsError(`Cannot create the session worktree; nothing was changed:\n- ${problems.join('\n- ')}`,
      'Fix the items above (--branch and --path choose other names), or start without --worktree.');
  }
  let gitInfo;
  try {
    gitInfo = addWorktree(projectRoot, worktreePath, branch);
  } catch (err) {
    throw new GpsError(`${err.message}. Nothing was changed.`, 'Fix the cause git reports, then run /gps start --worktree again.');
  }
  return { root: gitInfo.worktree_path, gitInfo };
}

// The report for an unfinished session of the same name; reads only.
function resumeReport(sessionsDir, found, wantIssue, warn) {
  const { sessionId, config } = found;
  const kind = (config && config.kind) || 'feature';
  if (wantIssue && kind !== 'issue') warn(`--issue was given, but session ${sessionId} is a feature session; its kind is kept.`);
  if (!wantIssue && kind === 'issue') warn(`Session ${sessionId} is an issue session (no --issue given); its kind is kept.`);

  const { ticketQueue, phase, suggestedNext } = computeSessionState(path.join(sessionsDir, sessionId), config);
  const { lastActivityAt, idleDays } = computeIdleness(sessionsDir, sessionId, config);
  const isCurrent = readCurrentPointer(sessionsDir) === sessionId;
  const tickets = { done: ticketQueue.tickets.filter((t) => t.done).length, total: ticketQueue.tickets.length };
  const lines = [`↩️ Session ${sessionId} already exists and is not finished.`, `Phase: ${phase}`];
  if (tickets.total > 0) lines.push(`Tickets: ${tickets.done}/${tickets.total} done`);
  lines.push(`Last activity: ${lastActivityAt || 'unknown'}${idleDays === null ? '' : ` (idle ${idleDays} day(s))`}`,
    `Current session: ${isCurrent ? 'yes' : 'no'}`, '', `Next: ${suggestedNext.command} — ${suggestedNext.why}`);
  return {
    text: lines.join('\n'),
    data: { resumable: true, sessionId, kind, phase, isCurrent, suggestedNext, tickets, lastActivityAt, idleDays },
  };
}

main({
  usage: 'start.js <feature-name...> [--issue] [--worktree [--path <dir>] [--branch <name>]] [--json]',
  positionals: { min: 1, max: Infinity },
  options: { issue: 'boolean', worktree: 'boolean', path: 'string', branch: 'string' },
  run({ positionals, options, projectRoot: checkoutRoot, warn }) {
    const featureName = positionals.join(' ').trim();
    if (!featureName) throw new UsageError('Missing feature name.');
    if (!options.worktree && (options.path || options.branch)) throw new UsageError('--path and --branch need --worktree.');
    let projectRoot = checkoutRoot;
    // Before anything writes: an unfinished session of the same name is resumed, not duplicated.
    const sessionsDir = sessionsDirOf(projectRoot);
    const found = findUnfinishedBySlug(sessionsDir, slugify(featureName));
    if (found) return resumeReport(sessionsDir, found, Boolean(options.issue), warn);
    // Detects GitHub once; a corrupt file aborts before anything is created.
    // A worktree session needs the project config committed: every
    // worktree then shares it, and parallel branches cannot each add their own.
    if (!options.worktree) {
      const active = readCurrentPointer(sessionsDir);
      const activeConfig = active && readConfigOrNull(sessionsDir, active);
      if (activeConfig && !activeConfig.finished_at) {
        warn(`Session ${active} is still unfinished in this checkout and is no longer current. `
          + 'To run sessions in parallel, start each with --worktree (one git worktree per session).');
      }
    }
    let worktree = null;
    if (options.worktree) {
      worktree = prepareWorktree(projectRoot, featureName, options);
      projectRoot = worktree.root;
    }
    const github = ensureProjectConfig(projectRoot).github.enabled;
    const extra = { ...(options.issue ? { kind: 'issue' } : {}), ...(worktree ? { git: worktree.gitInfo } : {}) };
    const session = initSession(projectRoot, featureName, extra);
    if (worktree) {
      const configPath = path.join(session.workDir, '.session-config.json');
      recordEvent(configPath, readJson(configPath), session.workDir, {
        event: 'branch_created',
        detail: { branch: worktree.gitInfo.branch, base: worktree.gitInfo.base_branch, worktree: worktree.root },
        at: worktree.gitInfo.branch_created_at,
      });
    }

    const seed = getSeed(session.sessionsDir, session.slug);
    if (seed) removeSeed(session.sessionsDir, session.slug);
    if (options.issue && !github) {
      warn('GitHub is not enabled for this project: this is a local session, no issue will be created '
        + '(set github.enabled in .work/gps-config.json to change that).');
    }
    if (isWorkTree(projectRoot) && isIgnored(projectRoot, '.work/')) {
      warn('.work/ is git-ignored, so gps commits none of its session files. '
        + 'Run /gps init to remove the ".work/" line from .gitignore and keep them with the code.');
    }

    const resumePath = path.join(session.grillDir, 'resume.md');
    const lines = [`✅ Session started: ${session.sessionId}${options.issue ? ' (issue)' : ''}`];
    if (worktree) {
      lines.push(`🌳 Worktree: ${worktree.root} on branch ${worktree.gitInfo.branch} (from ${worktree.gitInfo.base_branch})`);
    }
    if (session.cleaned) lines.push(`Feature name "${featureName}" cleaned to "${session.slug}".`);
    lines.push(`Path: ${session.workDir}`, `Scratch dir: ${session.scratchDir} (run/test artifacts go here)`);
    for (const entry of session.gitignoreAdded) lines.push(`Added "${entry}" to .gitignore`);
    if (seed) {
      lines.push('', `Scout seed for "${session.slug}" (from ${seed.sourceReport}): open the grill with it instead of starting from zero.`,
        '', '```json', JSON.stringify(seed, null, 2), '```');
    }
    if (needsSetup(projectRoot)) {
      lines.push('', 'Tip: /gps init (once per project) commits gps\'s setup (.gitignore, .work/gps-config.json) on its own, '
        + 'so it stays out of this session\'s commits.');
    }
    const issueNote = options.issue && github ? ' and files the GitHub issue' : '';
    if (worktree) lines.push('', `Work in ${worktree.root} from now on: run every command and edit every file there.`);
    lines.push('', `Next: run the grill${options.issue ? ', framed as a report (problem, reproduction, expected result)' : ''}. `
      + `Once the design is approved, /gps plan (or /gps write) saves it to ${resumePath}${issueNote}.`);

    return {
      text: lines.join('\n'),
      data: {
        ...session, resumable: false, kind: options.issue ? 'issue' : 'feature', github, seed, resumePath,
        worktree: worktree ? { path: worktree.root, ...worktree.gitInfo } : null,
      },
    };
  },
});
