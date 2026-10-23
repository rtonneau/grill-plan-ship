#!/usr/bin/env node

/**
 * idea-save.js <slug> --action <capture|grill|plan|review|promote|drop>
 *              [--global] [--body-file <f>] [--event "<text>"]
 *              [--promoted-to "<repo>:<session-id>"] [--create-work-dir] [--json]
 *
 * Writes (or updates) an Idea file for the given action's resulting status,
 * then commits it (alone, nothing else staged) unless there is no repo.
 * Everything before the write only reads: a refusal leaves the disk
 * untouched.
 */

const fs = require('node:fs');
const path = require('node:path');
const { main } = require('./lib/cli');
const { UsageError, IdeaError, writeTextAtomic } = require('./lib/guard');
const { validateSlug, parseIdea, serializeIdea, checkBody, nextStatus } = require('./lib/idea-file');
const { resolveScope, readGlobalConfig, repoRoot, currentBranch } = require('./lib/scope');
const { commitPaths } = require('./lib/git');

const ACTIONS = ['capture', 'grill', 'plan', 'review', 'promote', 'drop'];
const BODY_REQUIRED = ['grill', 'plan', 'review'];

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

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

function originText(cwd) {
  const root = repoRoot(cwd);
  if (!root) return '(no repo)';
  const branch = currentBranch(root);
  return `(${path.basename(root)} @ ${branch === null ? 'detached HEAD' : branch})`;
}

main({
  usage:
    'idea-save.js <slug> --action <capture|grill|plan|review|promote|drop> [--global] [--body-file <f>] ' +
    '[--event "<text>"] [--promoted-to "<repo>:<session-id>"] [--create-work-dir] [--json]',
  positionals: { min: 1, max: 1 },
  options: {
    action: 'string',
    global: 'boolean',
    'body-file': 'string',
    event: 'string',
    'promoted-to': 'string',
    'create-work-dir': 'boolean',
  },
  run({ positionals, options, projectRoot }) {
    const slug = positionals[0];
    const action = options.action;
    if (action === null) throw new UsageError('--action is required');
    if (!ACTIONS.includes(action)) throw new UsageError(`unknown action "${action}" (expected ${ACTIONS.join('|')})`);
    if (options['promoted-to'] !== null && action !== 'promote') {
      throw new UsageError('--promoted-to is only valid with --action promote');
    }
    if (action === 'promote' && !options['promoted-to']) {
      throw new UsageError('--action promote needs --promoted-to "<repo>:<session-id>"');
    }
    checkSlug(slug);
    if (BODY_REQUIRED.includes(action) && options['body-file'] === null) {
      throw new IdeaError(`--body-file is required for ${action}`);
    }

    // Everything below up to the write only reads: a refusal leaves the disk untouched.
    let body = null;
    if (options['body-file'] !== null) {
      const bodyFile = path.resolve(options['body-file']);
      try {
        body = fs.readFileSync(bodyFile, 'utf8').replace(/\r\n/g, '\n');
      } catch (e) {
        throw new IdeaError(`cannot read body file ${bodyFile}: ${e.message}`);
      }
      try {
        checkBody(body);
      } catch (e) {
        throw new IdeaError(e.message);
      }
    }

    const cwd = projectRoot;
    const global = !!options.global;
    const { globalRoot } = readGlobalConfig();
    const scope = resolveScope({ cwd, global, globalRoot });
    if (!scope.workDirExists && !options['create-work-dir']) {
      const workDir = path.join(global ? globalRoot : scope.gitRoot || path.resolve(cwd), '.work');
      const choices = global
        ? 'pass --create-work-dir to create it'
        : 'pass --create-work-dir to create it, or use --global to save in the Global Backlog';
      throw new IdeaError(`.work/ is missing at ${workDir}: ${choices}`);
    }

    const file = ideaFile(scope.ideaDir, slug);
    const existing = readIdea(file);
    const current = existing ? existing.meta.status : null;
    if ((action === 'capture' || action === 'grill') && existing && current !== 'captured') {
      throw new IdeaError(`Idea "${slug}" already exists with status ${current}: ${file}`);
    }
    let status;
    try {
      status = nextStatus(current, action);
    } catch (e) {
      throw new IdeaError(`${e.message}${existing ? ` (${file})` : ''}`);
    }

    const event = options.event === null ? undefined : options.event;
    const idea = existing || {
      meta: { status: null, scope: scope.scope, created: today(), reviews: 0, promoted_to: null },
      body: '',
      changelog: [],
    };
    idea.meta.status = status;
    if (body !== null) idea.body = body;
    else if (!existing && action === 'capture') idea.body = `## Problem\n\n${event === undefined ? '' : event}\n`;
    if (action === 'review') idea.meta.reviews = (Number(idea.meta.reviews) || 0) + 1;
    if (action === 'promote') idea.meta.promoted_to = options['promoted-to'];

    let text = action;
    if (event !== undefined && event !== '') text += ` — ${event}`;
    if (action === 'capture') text += ` ${originText(cwd)}`;
    idea.changelog.push({ date: today(), text });

    fs.mkdirSync(scope.ideaDir, { recursive: true });
    writeTextAtomic(file, serializeIdea(idea));

    const message = action === 'review' ? `idea(${slug}): review ${idea.meta.reviews}` : `idea(${slug}): ${action}`;
    let commit;
    if (!scope.gitRoot) {
      commit = { sha: null, skipped: 'not in a git repository' };
    } else {
      const rel = path.relative(scope.gitRoot, file).split(path.sep).join('/');
      try {
        commit = commitPaths(scope.gitRoot, [rel], message);
      } catch (e) {
        throw new IdeaError(`saved ${file} but the commit failed: ${(e.stderr || e.message).toString().trim()}`);
      }
    }

    const outText = [
      file,
      commit.sha ? `committed ${commit.sha} ${message}` : `not committed: ${commit.skipped}`,
    ].join('\n');
    return {
      text: outText,
      data: { path: file, status, reviews: idea.meta.reviews, sha: commit.sha, skipped: commit.skipped || null },
    };
  },
});
