#!/usr/bin/env node

/**
 * idea-list.js [--all] [--json]
 *
 * Lists Ideas in both scopes (project and, if configured, Global), grouped
 * by status. By default shows only active statuses (captured, grilled,
 * planned); --all adds promoted and dropped. Cross-references each Idea's
 * slug against gps session feature names to flag a likely matching session.
 */

const fs = require('node:fs');
const path = require('node:path');
const { main } = require('./lib/cli');
const { parseIdea } = require('./lib/idea-file');
const { resolveScope, readGlobalConfig, listIdeaSlugs } = require('./lib/scope');

const ACTIVE_STATUSES = ['captured', 'grilled', 'planned'];
const ALL_STATUSES = [...ACTIVE_STATUSES, 'promoted', 'dropped'];

function ideaFile(ideaDir, slug) {
  return path.join(ideaDir, `${slug}.md`);
}

function readSessions(gitRoot) {
  if (!gitRoot) return [];
  const dir = path.join(gitRoot, '.work', 'sessions');
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const sessions = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const cfg = readSessionConfig(path.join(dir, e.name, '.session-config.json'));
    if (cfg) sessions.push({ id: e.name, featureName: cfg.featureName });
  }
  return sessions.sort((a, b) => a.id.localeCompare(b.id));
}

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

function listScope(ideaDir, all, sessions, warnings) {
  if (!ideaDir) return [];
  const statuses = all ? ALL_STATUSES : ACTIVE_STATUSES;
  const entries = [];
  for (const slug of listIdeaSlugs(ideaDir)) {
    const file = ideaFile(ideaDir, slug);
    let idea;
    try {
      idea = parseIdea(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      warnings.push(`skipped ${file}: ${e.message}`);
      continue;
    }
    const { status, created, reviews } = idea.meta;
    if (!statuses.includes(status)) continue;
    let gpsMatch = null;
    if (status !== 'promoted') {
      const matches = sessions.filter((s) => s.featureName === slug);
      if (matches.length > 0) gpsMatch = matches[matches.length - 1].id;
    }
    entries.push({ slug, status, created: created === undefined ? null : created, reviews, path: file, gpsMatch });
  }
  return entries.sort((a, b) => statuses.indexOf(a.status) - statuses.indexOf(b.status) || a.slug.localeCompare(b.slug));
}

main({
  usage: 'idea-list.js [--all] [--json]',
  positionals: { min: 0, max: 0 },
  options: { all: 'boolean' },
  run({ options, projectRoot, warn }) {
    const { globalRoot } = readGlobalConfig();
    const project = resolveScope({ cwd: projectRoot, global: false, globalRoot });
    const sessions = readSessions(project.gitRoot);
    const warnings = [];
    const all = !!options.all;
    const data = {
      project: listScope(project.ideaDir, all, sessions, warnings),
      global: listScope(project.globalDir, all, sessions, warnings),
    };
    for (const w of warnings) warn(w);

    const lines = [];
    const section = (title, dir, entries) => {
      lines.push(`${title} (${dir || 'unavailable'}):`);
      if (entries.length === 0) lines.push('  (none)');
      for (const e of entries) {
        let line = `  ${e.status.padEnd(8)} ${e.slug}  created ${e.created}, reviews ${e.reviews}`;
        if (e.gpsMatch) line += `  [gps session ${e.gpsMatch}]`;
        lines.push(line);
      }
    };
    section('Project', project.ideaDir, data.project);
    section('Global', project.globalDir, data.global);
    return { text: lines.join('\n'), data };
  },
});
