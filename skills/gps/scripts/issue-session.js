#!/usr/bin/env node

/**
 * /gps issue <title>
 *
 * Like /gps start, for something reported rather than designed: creates the
 * same session (directory, scratch dir, current-session pointer) with
 * `kind: "issue"` in .session-config.json. On a GitHub project the grill
 * write (write-apply.js) then files the GitHub issue from the resume; with
 * github.enabled false in .work/gps-config.json this is a local session and
 * a warning says so.
 */

const path = require('path');
const { githubEnabled } = require('./lib/project-config');
const { initSession, announceSession } = require('./lib/session-init');
const { GpsError, runCli } = require('./lib/guard');

runCli(() => {
  const title = process.argv.slice(2).join(' ').trim();
  if (!title) {
    throw new GpsError('Missing issue title.', 'Usage: /gps issue <title>');
  }

  const projectRoot = process.cwd();
  const enabled = githubEnabled(projectRoot); // before creating anything, so a corrupt config aborts cleanly

  const session = initSession(projectRoot, title, { kind: 'issue' });
  announceSession(session);

  if (!enabled) {
    console.error('⚠️  GitHub is not enabled for this project: this is a local session, no issue will be created.');
    console.error('   (Set github.enabled to true in .work/gps-config.json to change that.)');
  }
  console.log(`\nNext: the brainstorming conversation begins now, framed as a report (problem, reproduction, expected result).`);
  console.log(`Once it's approved, run /gps write to save the resume to ${path.join(session.grillDir, 'resume.md')}${enabled ? ' and file the GitHub issue' : ''}.`);
});
