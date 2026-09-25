#!/usr/bin/env node

/**
 * /gps start <feature-name>
 *
 * Creates session directory with structure:
 * .work/sessions/YYYY-MM-DD__<slug>/
 *   - .session-config.json
 *   - 01-grill/
 *       - resume.md
 *       - notes.md
 *   - INDEX.md
 * and a matching scratch directory for run/test artifacts:
 * .scratch/tests/<session-id>/   (recorded as scratch_dir in the config;
 * ".work/" and ".scratch/" are appended to the project's .gitignore if missing)
 *
 * <slug> is the feature name cleaned by slugify() (lowercase, accents
 * stripped, only a-z 0-9 . _ -), so it is always a safe directory name.
 * The date is the local date. If the session already exists, nothing is
 * written and the command fails.
 *
 * If .work/sessions/.pending-seeds.json has an entry whose key matches
 * this slug (written earlier by /gps scout), that entry is printed and
 * removed so the brainstorming conversation that follows can open
 * already seeded with it instead of starting from zero.
 */

const path = require('path');
const { ensureProjectConfig } = require('./lib/project-config');
const { initSession, announceSession } = require('./lib/session-init');
const { getSeed, removeSeed } = require('./lib/seeds-store');
const { GpsError, runCli } = require('./lib/guard');

function startSession(featureName) {
  const projectRoot = process.cwd();
  ensureProjectConfig(projectRoot); // detects GitHub once; a corrupt file aborts before anything is created

  const session = initSession(projectRoot, featureName);
  announceSession(session);

  const seed = getSeed(session.sessionsDir, session.slug);
  if (seed) {
    removeSeed(session.sessionsDir, session.slug);
    console.log(`\nScout seed found for "${session.slug}" (from ${seed.sourceReport}):`);
    console.log(JSON.stringify(seed, null, 2));
    console.log(`\nOpen brainstorming seeded with this candidate's problem/solution/files instead of starting from zero.`);
  } else {
    console.log(`\nNext: the brainstorming conversation begins now. Once it's approved,`);
    console.log(`run /gps write to save the resume to ${path.join(session.grillDir, 'resume.md')}, then /gps plan.`);
  }
}

runCli(() => {
  const featureName = process.argv.slice(2).join(' ').trim();
  if (!featureName) {
    throw new GpsError('Missing feature name.', 'Usage: /gps start <feature-name>');
  }
  startSession(featureName);
});
