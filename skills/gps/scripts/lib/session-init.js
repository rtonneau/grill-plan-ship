// skills/gps/scripts/lib/session-init.js
//
// /gps start: creates .work/sessions/YYYY-MM-DD__<slug>/ (01-grill/resume.md
// and .session-config.json), the session's scratch directory, the
// .gitignore entries (LOCAL_ONLY in setup.js) and .current-session. .work/ itself is
// committed: gps commits it at the plan write, each ticket and the finish;
// only the per-machine files below stay out of git.
// <slug> is the feature name cleaned by slugify(); the date is the local
// date. If the session already exists, nothing is written and it throws a
// GpsError.

const fs = require('fs');
const path = require('path');
const { loadTemplate, renderTemplate } = require('./templates');
const { sessionsDirOf, setCurrentSession } = require('./session-store');
const { TEMPLATE_VERSION } = require('./write-target');
const { touchPhase } = require('./token-usage');
const { recordEvent } = require('./history');
const { ensureScratchDir } = require('./scratch-dir');
const { ensureLocalIgnores } = require('./setup');
const { GpsError, localDate, slugify, writeJsonAtomic } = require('./guard');


// `extraConfig` is merged into .session-config.json (e.g. { kind: 'issue' });
// the session starts with an empty history and a `session_started` event.
// Returns what was created, for the caller to report.
function initSession(projectRoot, featureName, extraConfig = {}) {
  const now = new Date();
  const slug = slugify(featureName, now);
  const sessionId = `${localDate(now)}__${slug}`;

  const sessionsDir = sessionsDirOf(projectRoot);
  const workDir = path.join(sessionsDir, sessionId);
  const grillDir = path.join(workDir, '01-grill');

  if (fs.existsSync(workDir)) {
    throw new GpsError(
      `Session ${sessionId} already exists; nothing was changed.`,
      'Run /gps status to see where it left off, or pick a different feature name.'
    );
  }

  fs.mkdirSync(grillDir, { recursive: true });

  const scratchDir = ensureScratchDir(projectRoot, sessionId);
  const gitignoreAdded = ensureLocalIgnores(projectRoot);

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

  fs.writeFileSync(path.join(grillDir, 'resume.md'), renderTemplate(loadTemplate('01-grill-resume.md'), {
    'feature-name': featureName,
    timestamp: config.created_at,
  }));

  recordEvent(configPath, config, workDir, {
    event: 'session_started',
    files: ['01-grill/resume.md'],
    detail: extraConfig.kind ? { kind: extraConfig.kind } : undefined,
    at: config.created_at,
  });

  setCurrentSession(sessionsDir, sessionId);

  return { sessionId, slug, cleaned: slug !== featureName, sessionsDir, workDir, grillDir, scratchDir, gitignoreAdded };
}

module.exports = { initSession };
