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

const fs = require('fs');
const path = require('path');
const { loadTemplate, renderTemplate } = require('./lib/templates');
const { setCurrentSession } = require('./lib/session-store');
const { getSeed, removeSeed } = require('./lib/seeds-store');
const { touchPhase } = require('./lib/token-usage');
const { ensureScratchDir, ensureGitignoreEntry } = require('./lib/scratch-dir');
const { GpsError, localDate, slugify, writeJsonAtomic, runCli } = require('./lib/guard');

function startSession(featureName) {
  const now = new Date();
  const slug = slugify(featureName, now);
  const sessionId = `${localDate(now)}__${slug}`;

  const projectRoot = process.cwd();
  const sessionsDir = path.join(projectRoot, '.work', 'sessions');
  const workDir = path.join(sessionsDir, sessionId);
  const grillDir = path.join(workDir, '01-grill');

  if (fs.existsSync(workDir)) {
    throw new GpsError(
      `Session ${sessionId} already exists; nothing was changed.`,
      'Run /gps status to see where it left off, or pick a different feature name.'
    );
  }

  if (slug !== featureName) {
    console.log(`Feature name "${featureName}" cleaned to "${slug}".`);
  }

  fs.mkdirSync(grillDir, { recursive: true });

  const scratchDir = ensureScratchDir(projectRoot, sessionId);
  const gitignoreAdded = ['.work/', '.scratch/'].filter((entry) => ensureGitignoreEntry(projectRoot, entry));

  const config = {
    session_id: sessionId,
    feature_name: featureName,
    scratch_dir: scratchDir,
    created_at: now.toISOString(),
  };

  touchPhase(config, 'grill');

  writeJsonAtomic(path.join(workDir, '.session-config.json'), config);

  const resumeContent = renderTemplate(loadTemplate('01-grill-resume.md'), {
    'feature-name': featureName,
    timestamp: config.created_at,
  });

  fs.writeFileSync(path.join(grillDir, 'resume.md'), resumeContent);
  fs.writeFileSync(path.join(grillDir, 'notes.md'), '# Brainstorm Transcript\n\n(To be filled)\n');

  fs.writeFileSync(
    path.join(workDir, 'INDEX.md'),
    `# Session: ${featureName}\n\nPhase: Grill (in progress)\n`
  );

  setCurrentSession(sessionsDir, sessionId);

  console.log(`✅ Session initialized: ${sessionId}`);
  console.log(`Path: ${workDir}`);
  console.log(`Scratch dir: ${scratchDir} (run/test artifacts go here)`);
  for (const entry of gitignoreAdded) console.log(`Added "${entry}" to .gitignore`);

  const seed = getSeed(sessionsDir, slug);
  if (seed) {
    removeSeed(sessionsDir, slug);
    console.log(`\nScout seed found for "${slug}" (from ${seed.sourceReport}):`);
    console.log(JSON.stringify(seed, null, 2));
    console.log(`\nOpen brainstorming seeded with this candidate's problem/solution/files instead of starting from zero.`);
  } else {
    console.log(`\nNext: the brainstorming conversation begins now. Once it's approved,`);
    console.log(`run /gps write to save the resume to ${path.join(grillDir, 'resume.md')}, then /gps plan.`);
  }
}

runCli(() => {
  const featureName = process.argv.slice(2).join(' ').trim();
  if (!featureName) {
    throw new GpsError('Missing feature name.', 'Usage: /gps start <feature-name>');
  }
  startSession(featureName);
});
