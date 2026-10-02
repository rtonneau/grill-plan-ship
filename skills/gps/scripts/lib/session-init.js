// scripts/lib/session-init.js
//
// Session directory setup shared by /gps start and /gps issue.
// Creates .work/sessions/YYYY-MM-DD__<slug>/ (01-grill/resume.md + notes.md,
// .session-config.json, INDEX.md), the session's scratch directory, the
// .gitignore entries and .current-session. <slug> is the feature name
// cleaned by slugify(); the date is the local date. If the session already
// exists, nothing is written and it throws a GpsError.

const fs = require('fs');
const path = require('path');
const { loadTemplate, renderTemplate } = require('./templates');
const { setCurrentSession } = require('./session-store');
const { TEMPLATE_VERSION } = require('./write-target');
const { touchPhase } = require('./token-usage');
const { recordEvent } = require('./history');
const { ensureScratchDir, ensureGitignoreEntry } = require('./scratch-dir');
const { GpsError, localDate, slugify, writeJsonAtomic } = require('./guard');

// `extraConfig` is merged into .session-config.json (e.g. { kind: 'issue' });
// the session starts with an empty history and a `session_started` event.
function initSession(projectRoot, featureName, extraConfig = {}) {
  const now = new Date();
  const slug = slugify(featureName, now);
  const sessionId = `${localDate(now)}__${slug}`;

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
    template_version: TEMPLATE_VERSION,
    history: [],
    ...extraConfig,
  };

  touchPhase(config, 'grill');

  const configPath = path.join(workDir, '.session-config.json');
  writeJsonAtomic(configPath, config);

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

  recordEvent(configPath, config, workDir, {
    event: 'session_started',
    files: ['01-grill/resume.md'],
    detail: extraConfig.kind ? { kind: extraConfig.kind } : undefined,
    at: config.created_at,
  });

  setCurrentSession(sessionsDir, sessionId);

  return { sessionId, slug, sessionsDir, workDir, grillDir, scratchDir, gitignoreAdded };
}

function announceSession(session) {
  console.log(`✅ Session initialized: ${session.sessionId}`);
  console.log(`Path: ${session.workDir}`);
  console.log(`Scratch dir: ${session.scratchDir} (run/test artifacts go here)`);
  for (const entry of session.gitignoreAdded) console.log(`Added "${entry}" to .gitignore`);
}

module.exports = { initSession, announceSession };
