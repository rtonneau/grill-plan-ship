#!/usr/bin/env node

/**
 * idea-promote-check.js <session-id> [--json]
 *
 * Checks whether a gps session's .session-config.json shows its grill was
 * already saved as an Idea note (current_phase has moved past "grill").
 */

const fs = require('node:fs');
const path = require('node:path');
const { main } = require('./lib/cli');
const { IdeaError } = require('./lib/guard');
const { repoRoot } = require('./lib/scope');

const GRILL_PHASE = 'grill';

// Only the stable gps fields: feature_name and current_phase.
function readSessionConfig(file) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
  if (raw === null || typeof raw !== 'object') return null;
  return {
    featureName: typeof raw.feature_name === 'string' ? raw.feature_name : null,
    currentPhase: typeof raw.current_phase === 'string' ? raw.current_phase : null,
  };
}

main({
  usage: 'idea-promote-check.js <session-id> [--json]',
  positionals: { min: 1, max: 1 },
  options: {},
  run({ positionals, projectRoot }) {
    const id = positionals[0];
    if (id === '' || id === '.' || id === '..' || /[\\/]/.test(id)) throw new IdeaError(`invalid session id: ${id}`);
    const root = repoRoot(projectRoot) || path.resolve(projectRoot);
    const file = path.join(root, '.work', 'sessions', id, '.session-config.json');
    let data;
    if (!fs.existsSync(file)) {
      data = { exists: false, featureName: null, currentPhase: null, grillSaved: false };
    } else {
      const cfg = readSessionConfig(file);
      if (!cfg) throw new IdeaError(`cannot parse ${file}`);
      data = {
        exists: true,
        featureName: cfg.featureName,
        currentPhase: cfg.currentPhase,
        grillSaved: cfg.currentPhase !== null && cfg.currentPhase !== GRILL_PHASE,
      };
    }
    const text = !data.exists
      ? `session ${id}: not found at ${file}`
      : [
          `session ${id}: feature_name ${data.featureName}, current_phase ${data.currentPhase}`,
          data.grillSaved ? 'grill saved' : 'grill not saved yet',
        ].join('\n');
    return { text, data };
  },
});
