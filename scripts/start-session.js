#!/usr/bin/env node

/**
 * /gps start <feature-name>
 *
 * Creates session directory with structure:
 * .work/sessions/YYYYMMDD__<feature-name>/
 *   ├── .session-config.json
 *   ├── 01-grill/
 *   │   ├── resume.md
 *   │   └── notes.md
 *   └── INDEX.md
 */

const fs = require('fs');
const path = require('path');

function startSession(featureName) {
  // Generate session ID
  const date = new Date().toISOString().split('T')[0];
  const slug = featureName.toLowerCase().replace(/\s+/g, '-');
  const sessionId = `${date}__${slug}`;

  // Create directories
  const projectRoot = process.cwd();
  const workDir = path.join(projectRoot, '.work', 'sessions', sessionId);
  const grillDir = path.join(workDir, '01-grill');

  fs.mkdirSync(grillDir, { recursive: true });

  // Create .session-config.json
  const config = {
    session_id: sessionId,
    feature_name: featureName,
    created_at: new Date().toISOString(),
    phases_completed: [],
    tickets: [],
    status: 'grill-in-progress'
  };

  fs.writeFileSync(
    path.join(workDir, '.session-config.json'),
    JSON.stringify(config, null, 2)
  );

  // Create resume.md template
  const resumeTemplate = `# Session: ${featureName}

**Date:** ${new Date().toISOString()}
**Status:** Grill in progress

## Problem Statement

(To be filled by Claude after brainstorming)

## Context & Constraints

(To be filled)

## Success Metrics

(To be filled)

## Architecture & Approach

(To be filled)
`;

  fs.writeFileSync(path.join(grillDir, 'resume.md'), resumeTemplate);
  fs.writeFileSync(path.join(grillDir, 'notes.md'), '# Brainstorm Transcript\n\n(To be filled)\n');

  // Create initial INDEX.md
  fs.writeFileSync(
    path.join(workDir, 'INDEX.md'),
    `# Session: ${featureName}\n\nPhase: Grill (in progress)\n`
  );

  console.log(`✅ Session initialized: ${sessionId}`);
  console.log(`📁 Path: ${workDir}`);
  console.log(`\n📝 Next steps:`);
  console.log(`1. Run /brainstorming to clarify the spec`);
  console.log(`2. Save output to ${path.join(grillDir, 'resume.md')}`);
  console.log(`3. Then run /gps plan`);
}

// Main
const featureName = process.argv[2];
if (!featureName) {
  console.error('Usage: /gps start <feature-name>');
  process.exit(1);
}

startSession(featureName);