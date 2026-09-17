#!/usr/bin/env node

/**
 * /gps start <feature-name>
 *
 * Creates session directory with structure:
 * .work/sessions/YYYY-MM-DD__<feature-name>/
 *   - .session-config.json
 *   - 01-grill/
 *       - resume.md
 *       - notes.md
 *   - INDEX.md
 */

const fs = require('fs');
const path = require('path');
const { loadTemplate, renderTemplate } = require('./lib/templates');
const { setCurrentSession } = require('./lib/session-store');

function startSession(featureName) {
  const date = new Date().toISOString().split('T')[0];
  const slug = featureName.toLowerCase().replace(/\s+/g, '-');
  const sessionId = `${date}__${slug}`;

  const projectRoot = process.cwd();
  const sessionsDir = path.join(projectRoot, '.work', 'sessions');
  const workDir = path.join(sessionsDir, sessionId);
  const grillDir = path.join(workDir, '01-grill');

  fs.mkdirSync(grillDir, { recursive: true });

  const config = {
    session_id: sessionId,
    feature_name: featureName,
    created_at: new Date().toISOString(),
    phases_completed: [],
    tickets: [],
    status: 'grill-in-progress',
  };

  fs.writeFileSync(
    path.join(workDir, '.session-config.json'),
    JSON.stringify(config, null, 2)
  );

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

  console.log(`Session initialized: ${sessionId}`);
  console.log(`Path: ${workDir}`);
  console.log(`\nNext: the brainstorming conversation begins now. Once it's approved,`);
  console.log(`run /gps write to save the resume to ${path.join(grillDir, 'resume.md')}, then /gps plan.`);
}

const featureName = process.argv[2];
if (!featureName) {
  console.error('Usage: /gps start <feature-name>');
  process.exit(1);
}

startSession(featureName);
