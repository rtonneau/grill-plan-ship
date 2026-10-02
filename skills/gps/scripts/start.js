#!/usr/bin/env node

/**
 * start.js <feature-name...> [--issue] [--json]
 *
 * /gps start: creates the session (directory, resume template, scratch dir,
 * .gitignore entry for .scratch/, .current-session) and records GitHub detection in
 * .work/gps-config.json the first time. With --issue the session is a
 * report (kind "issue"): on a GitHub project the grill write files it as
 * a GitHub issue; otherwise a warning says it stays local.
 *
 * A scouted idea whose slug matches the session's is consumed: printed as
 * the grill's starting context and removed from .pending-seeds.json.
 */

const path = require('path');
const { main } = require('./lib/cli');
const { ensureProjectConfig } = require('./lib/project-config');
const { initSession } = require('./lib/session-init');
const { getSeed, removeSeed } = require('./lib/seeds-store');
const { UsageError } = require('./lib/guard');

main({
  usage: 'start.js <feature-name...> [--issue] [--json]',
  positionals: { min: 1, max: Infinity },
  options: { issue: 'boolean' },
  run({ positionals, options, projectRoot, warn }) {
    const featureName = positionals.join(' ').trim();
    if (!featureName) throw new UsageError('Missing feature name.');
    // Detects GitHub once; a corrupt file aborts before anything is created.
    const github = ensureProjectConfig(projectRoot).github.enabled;
    const session = initSession(projectRoot, featureName, options.issue ? { kind: 'issue' } : {});

    const seed = getSeed(session.sessionsDir, session.slug);
    if (seed) removeSeed(session.sessionsDir, session.slug);
    if (options.issue && !github) {
      warn('GitHub is not enabled for this project: this is a local session, no issue will be created '
        + '(set github.enabled in .work/gps-config.json to change that).');
    }

    const resumePath = path.join(session.grillDir, 'resume.md');
    const lines = [`✅ Session started: ${session.sessionId}${options.issue ? ' (issue)' : ''}`];
    if (session.cleaned) lines.push(`Feature name "${featureName}" cleaned to "${session.slug}".`);
    lines.push(`Path: ${session.workDir}`, `Scratch dir: ${session.scratchDir} (run/test artifacts go here)`);
    for (const entry of session.gitignoreAdded) lines.push(`Added "${entry}" to .gitignore`);
    if (seed) {
      lines.push('', `Scout seed for "${session.slug}" (from ${seed.sourceReport}): open the grill with it instead of starting from zero.`,
        '', '```json', JSON.stringify(seed, null, 2), '```');
    }
    const issueNote = options.issue && github ? ' and files the GitHub issue' : '';
    lines.push('', `Next: run the grill${options.issue ? ', framed as a report (problem, reproduction, expected result)' : ''}. `
      + `Once the design is approved, /gps plan (or /gps write) saves it to ${resumePath}${issueNote}.`);

    return {
      text: lines.join('\n'),
      data: { ...session, kind: options.issue ? 'issue' : 'feature', github, seed, resumePath },
    };
  },
});
