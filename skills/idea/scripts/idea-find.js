#!/usr/bin/env node

/**
 * idea-find.js <slug> [--json]
 *
 * Looks up an Idea by slug in both scopes (project and, if configured,
 * Global), reporting its status and file path in each where it exists.
 */

const fs = require('node:fs');
const path = require('node:path');
const { main } = require('./lib/cli');
const { IdeaError } = require('./lib/guard');
const { validateSlug, parseIdea } = require('./lib/idea-file');
const { resolveScope, readGlobalConfig } = require('./lib/scope');

function checkSlug(slug) {
  try {
    validateSlug(slug);
  } catch (e) {
    throw new IdeaError(e.message);
  }
}

function ideaFile(ideaDir, slug) {
  return path.join(ideaDir, `${slug}.md`);
}

function readIdea(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return parseIdea(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new IdeaError(`cannot parse ${file}: ${e.message}`);
  }
}

function locate(ideaDir, slug) {
  if (!ideaDir) return null;
  const file = ideaFile(ideaDir, slug);
  const idea = readIdea(file);
  return idea ? { status: idea.meta.status, path: file } : null;
}

main({
  usage: 'idea-find.js <slug> [--json]',
  positionals: { min: 1, max: 1 },
  options: {},
  run({ positionals, projectRoot }) {
    const slug = positionals[0];
    checkSlug(slug);
    const { globalRoot } = readGlobalConfig();
    const project = resolveScope({ cwd: projectRoot, global: false, globalRoot });
    const result = { project: locate(project.ideaDir, slug), global: locate(project.globalDir, slug) };
    const line = (name, hit) => `${name}: ${hit ? `${hit.status} ${hit.path}` : 'none'}`;
    const text = [line('project', result.project), line('global', result.global)].join('\n');
    return { text, data: result };
  },
});
