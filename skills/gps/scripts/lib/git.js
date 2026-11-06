// skills/gps/scripts/lib/git.js
//
// Every git call the scripts make. Git always runs via execFileSync with an
// argument array (never a shell string), so paths and names can't be
// interpreted by a shell. Read helpers return [] / null on any error (not a
// repo, git missing, ...); write helpers return { ok, reason, commands }
// so a caller can print the commands to run by hand, except where noted.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { writeJsonAtomic } = require('./guard');

const DEFAULT_MAX_COMMITS = 10;
const BRANCH_TYPES = ['feat', 'fix', 'refactor', 'docs', 'chore', 'perf', 'test'];
const BRANCH_RE = new RegExp(`^(${BRANCH_TYPES.join('|')})/[a-z0-9]+([._-][a-z0-9]+)*$`);
const MAX_BRANCH_LENGTH = 80;
const BRANCH_PATTERN = `<${BRANCH_TYPES.join('|')}>/<short-slug>`;
const UNREVIEWED_COMMIT = 'gps-unreviewed-commit.json';

// Find the worktree that contains a project root without asking git first:
// safe.directory must already be in effect before git will inspect a checkout
// owned by the host user from an agent sandbox account. A .git directory is a
// normal checkout; a .git file is a linked worktree.
function repositoryRoot(projectRoot) {
  let current = path.resolve(projectRoot);
  while (true) {
    if (fs.existsSync(path.join(current, '.git'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

// git compares safe.directory literally: on Windows a backslash path never matches.
function safeGitArgs(projectRoot, args) {
  const root = repositoryRoot(projectRoot);
  return root ? ['-c', `safe.directory=${root.split(path.sep).join('/')}`, ...args] : args;
}

function git(projectRoot, args) {
  return execFileSync('git', safeGitArgs(projectRoot, args), {
    cwd: projectRoot,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function tryGit(projectRoot, args) {
  try {
    return git(projectRoot, args);
  } catch (_err) {
    return null;
  }
}

function gitResult(projectRoot, args) {
  try {
    return { ok: true, output: git(projectRoot, args) };
  } catch (err) {
    return { ok: false, reason: failureReason(err) };
  }
}

// Local branches whose tip holds `relPath` (e.g. a session committed on a
// branch that is not checked out).
function branchesHolding(projectRoot, relPath) {
  return lines(tryGit(projectRoot, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']))
    .filter((branch) => tryGit(projectRoot, ['cat-file', '-e', `${branch}:${relPath}`]) !== null);
}

// Git's "dubious ownership" refusal ends with a suggested `git config` command,
// so the last stderr line alone points at a fix that may not apply: a sandboxed
// process runs as another account and can't read the user's global config.
const DUBIOUS_OWNERSHIP_REASON = 'git refuses this repository because it belongs to another user. '
  + 'If safe.directory is already set in your global git config, this process runs as a different '
  + 'account (typically an agent sandbox) and cannot read it: rerun the script outside the sandbox';

// Short, readable reason from a failed execFileSync.
function failureReason(err) {
  const stderr = err && err.stderr ? String(err.stderr).trim() : '';
  if (/dubious ownership/i.test(stderr)) return DUBIOUS_OWNERSHIP_REASON;
  if (stderr) return stderr.split('\n').filter(Boolean).pop();
  return err && err.code === 'ENOENT' ? 'command not found' : (err && err.message) || String(err);
}

const lines = (out) => (out ? out.split('\n').map((l) => l.trim()).filter(Boolean) : []);
const nulList = (out) => (out || '').split('\0').filter(Boolean);
const quote = (text) => `"${String(text).replace(/"/g, '\\"')}"`;

// Asked several times per script run. Only a yes is remembered: a script may
// be the one that creates the repository, but none ever removes it.
const knownWorkTrees = new Set();
function isWorkTree(projectRoot) {
  const key = path.resolve(projectRoot);
  if (knownWorkTrees.has(key)) return true;
  const inside = tryGit(projectRoot, ['rev-parse', '--is-inside-work-tree']) === 'true';
  if (inside) knownWorkTrees.add(key);
  return inside;
}

// Per-worktree state, including linked worktrees, outside committed project files.
function gitPrivatePath(projectRoot, name) {
  const location = tryGit(projectRoot, ['rev-parse', '--git-path', name]);
  return location ? path.resolve(projectRoot, location) : null;
}

function originUrl(projectRoot) {
  return tryGit(projectRoot, ['config', '--get', 'remote.origin.url']);
}

function currentBranch(projectRoot) {
  return tryGit(projectRoot, ['branch', '--show-current']) || null;
}

// A detached worktree still has enough information to create a session
// branch. Prefer a branch checked out by another worktree at the same commit;
// this is the normal shape of agent worktrees. Otherwise use an unambiguous
// local branch at HEAD, preferring the repository's default branch when more
// than one points there. Git failures are kept distinct from a detached HEAD.
function sessionBaseBranch(projectRoot) {
  const branch = gitResult(projectRoot, ['branch', '--show-current']);
  if (!branch.ok) throw new Error(`git could not inspect the current branch: ${branch.reason}`);
  if (branch.output) return branch.output;

  const head = gitResult(projectRoot, ['rev-parse', 'HEAD']);
  if (!head.ok) throw new Error(`git could not inspect detached HEAD: ${head.reason}`);

  const worktrees = gitResult(projectRoot, ['worktree', 'list', '--porcelain']);
  if (!worktrees.ok) throw new Error(`git could not inspect linked worktrees: ${worktrees.reason}`);
  const checkedOut = worktrees.output.split(/\r?\n\r?\n/).map((block) => {
    const sha = /^HEAD (.+)$/m.exec(block);
    const ref = /^branch refs\/heads\/(.+)$/m.exec(block);
    return sha && ref && sha[1] === head.output ? ref[1] : null;
  }).filter(Boolean);
  if (checkedOut.length === 1) return checkedOut[0];

  const refs = gitResult(projectRoot, [
    'for-each-ref', '--format=%(refname:short)', '--points-at', 'HEAD', 'refs/heads',
  ]);
  if (!refs.ok) throw new Error(`git could not find a base branch for detached HEAD: ${refs.reason}`);
  const candidates = lines(refs.output);
  if (candidates.length === 1) return candidates[0];
  const preferred = defaultBranch(projectRoot);
  if (preferred && candidates.includes(preferred)) return preferred;
  if (checkedOut.length > 1) {
    throw new Error(`HEAD is detached and multiple linked-worktree branches point at it: ${checkedOut.join(', ')}`);
  }
  if (candidates.length > 1) {
    throw new Error(`HEAD is detached and multiple local branches point at it: ${candidates.join(', ')}`);
  }
  throw new Error('HEAD is detached and no local branch points at it; check out or create the branch that the pull request should target');
}

// Throws when git cannot inspect the repository at all (dubious ownership,
// not a repo, ...): that is not the same as the commit being absent.
function commitExists(projectRoot, sha) {
  const repo = gitResult(projectRoot, ['rev-parse', '--git-dir']);
  if (!repo.ok) throw new Error(`git could not inspect the repository: ${repo.reason}`);
  return tryGit(projectRoot, ['cat-file', '-e', `${sha}^{commit}`]) !== null;
}

// "<short sha> <subject>" of a commit, or null when it does not exist.
function describeCommit(projectRoot, sha) {
  return tryGit(projectRoot, ['log', '-1', '--format=%h %s', `${sha}^{commit}`, '--']) || null;
}

// Project-wide commits (oneline) made since `sinceIso` (the session's
// created_at), newest first. With no sinceIso, the latest commits.
function readRecentCommits(projectRoot, sinceIso, max = DEFAULT_MAX_COMMITS) {
  const args = ['log', '--oneline', '-n', String(max)];
  const sinceMs = sinceIso ? Date.parse(sinceIso) : NaN;
  // "@<unix seconds>" is git's unambiguous raw date format.
  if (!Number.isNaN(sinceMs)) args.push(`--since=@${Math.floor(sinceMs / 1000)}`);
  return lines(tryGit(projectRoot, args));
}

function commitsBetween(projectRoot, base, branch) {
  return lines(tryGit(projectRoot, ['log', '--oneline', '--no-decorate', `${base}..${branch}`]));
}

function parsePorcelain(output) {
  return output
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => ({ indexStatus: line[0], worktreeStatus: line[1], path: line.slice(3) }));
}

// `git status --porcelain` for the whole project, or only `pathspec`.
function readGitStatusEntries(projectRoot, pathspec) {
  const args = ['status', '--porcelain', '--untracked-files=all'];
  if (pathspec) args.push('--', pathspec);
  try {
    return parsePorcelain(execFileSync('git', safeGitArgs(projectRoot, args), {
      cwd: projectRoot, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'],
    }));
  } catch (_err) {
    return [];
  }
}

// Both views: the project's code changes (gps's own .work/ left out, as it
// may or may not be tracked) and the session directory.
function readGitStatus(projectRoot, sessionDir) {
  const relPath = path.relative(projectRoot, sessionDir).replace(/\\/g, '/');
  return {
    project: readGitStatusEntries(projectRoot, null).filter((e) => !e.path.startsWith('.work/')),
    session: readGitStatusEntries(projectRoot, relPath),
  };
}

// Problems with a proposed session branch name, as payload error strings.
function validateBranchName(projectRoot, name) {
  if (!name) return [`Missing field "**Branch:**": name the session branch ${BRANCH_PATTERN}, e.g. feat/dark-mode-toggle.`];
  const errors = [];
  if (name.length > MAX_BRANCH_LENGTH || !BRANCH_RE.test(name)) {
    errors.push(`Branch "${name}" must look like ${BRANCH_PATTERN} (lowercase a-z 0-9, "-", "_" or "." between, at most ${MAX_BRANCH_LENGTH} characters), e.g. feat/dark-mode-toggle.`);
  } else if (tryGit(projectRoot, ['check-ref-format', '--branch', name]) === null) {
    errors.push(`Branch "${name}" is not a valid git branch name.`);
  } else if (tryGit(projectRoot, ['rev-parse', '--verify', '--quiet', `refs/heads/${name}`]) !== null) {
    errors.push(`Branch "${name}" already exists. Pick another name.`);
  }
  try {
    sessionBaseBranch(projectRoot);
  } catch (err) {
    errors.push(`${err.message}.`);
  }
  return errors;
}

function branchType(branch) {
  return String(branch).split('/')[0];
}

// Creates `name` from HEAD and switches to it (uncommitted changes carry
// over). Returns the config's `git` record. Throws with git's reason.
function createSessionBranch(projectRoot, name) {
  const base = sessionBaseBranch(projectRoot);
  try {
    git(projectRoot, ['switch', '-c', name]);
  } catch (err) {
    throw new Error(`git switch -c ${name} failed: ${failureReason(err)}`);
  }
  return { branch: name, base_branch: base, branch_created_at: new Date().toISOString(), pr_url: null };
}

// Never throws: { ok: true } or { ok: false, reason, commands }.
function switchBranch(projectRoot, name) {
  try {
    git(projectRoot, ['switch', '-q', name]);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: failureReason(err), commands: [`git switch ${name}`] };
  }
}

// True when `relPath` is in the index (committed or staged).
function isTracked(projectRoot, relPath) {
  return tryGit(projectRoot, ['ls-files', '--error-unmatch', '--', relPath]) !== null;
}

// True when `relPath` has changes git would commit: modified, staged or
// untracked (ignored files never count).
function pathHasChanges(projectRoot, relPath) {
  return readGitStatusEntries(projectRoot, relPath).length > 0;
}

// True when git ignores `relPath` (e.g. an older .gitignore with ".work/").
// A directory ("dir/") is judged through a child: git turns a blank line of a
// CRLF ignore file into an empty pattern that matches any path ending in "/",
// which reported .work/ as ignored and silently stopped every record commit.
function isIgnored(projectRoot, relPath) {
  const target = relPath.endsWith('/') ? `${relPath}.gps-ignore-probe` : relPath;
  return tryGit(projectRoot, ['check-ignore', '-q', '--no-index', '--', target]) !== null;
}

// isIgnored for several ASCII paths with one git process. check-ignore exits 1
// when nothing matches, which reads as an empty set, as isIgnored reads it as false.
function ignoredPaths(projectRoot, relPaths) {
  const target = (p) => (p.endsWith('/') ? `${p}.gps-ignore-probe` : p);
  const matched = new Set(lines(tryGit(projectRoot, ['check-ignore', '--no-index', '--', ...relPaths.map(target)])));
  return new Set(relPaths.filter((p) => matched.has(target(p))));
}

// isTracked for several paths with one git process: a directory is tracked
// when a file under it is.
function trackedPaths(projectRoot, relPaths) {
  const files = nulList(tryGit(projectRoot, ['ls-files', '-z', '--', ...relPaths]));
  return new Set(relPaths.filter((p) => files.some((f) => f === p || f.startsWith(`${p}/`))));
}

// Finish has no ownership information for leftover code. Inspect it without
// staging or committing; the caller must resolve tracked edits explicitly.
// Untracked files are listed, never committed; .work/ is left out. Never throws:
// { ok: true, sha, files, untracked } (sha null: nothing to commit, or not a
// git repo) or { ok: false, reason, commands, untracked }.
function commitRemainingChanges(projectRoot, message) {
  if (!isWorkTree(projectRoot)) return { ok: true, sha: null, files: [], untracked: [] };
  const untracked = nulList(tryGit(projectRoot, ['ls-files', '--others', '--exclude-standard', '-z']))
    .filter((f) => !f.startsWith('.work/'));
  try {
    const args = ['--name-only', '--relative', '--no-renames', '--diff-filter=DMT', '-z', 'HEAD', '--', '.', ':(exclude).work'];
    const files = [...new Set([
      ...nulList(git(projectRoot, ['diff', ...args])),
      ...nulList(git(projectRoot, ['diff', '--cached', ...args])),
    ])];
    if (files.length === 0) return { ok: true, sha: null, files, untracked };
    return { ok: false, reason: `tracked changes need an explicit scoped commit: ${files.join(', ')}`, files, untracked, commands: [] };
  } catch (err) {
    return { ok: false, reason: failureReason(err), untracked, commands: [] };
  }
}

// Hooks can change the temporary index used by pathspec commits. Inspect the
// resulting commit rather than reporting the pre-hook staged list as truth.
function committedScope(projectRoot, allowed, commands, marker) {
  // git prints --show-prefix first whatever the order, and nothing but a blank
  // line at the top level; only the prefix ends in "/".
  const head = lines(git(projectRoot, ['rev-parse', '--short', 'HEAD', '--show-prefix']));
  const sha = head.find((l) => !l.endsWith('/'));
  const prefix = head.find((l) => l.endsWith('/')) || '';
  const files = nulList(git(projectRoot, ['diff-tree', '--root', '--no-commit-id', '--name-only', '--no-renames', '-r', '-z', 'HEAD']));
  const owned = allowed.map((f) => `${prefix}${f}`);
  const unexpected = files.filter((f) => !owned.includes(f));
  if (unexpected.length > 0) {
    if (!marker) throw new Error(`cannot record unexpected commit ${sha}; inspect it before continuing`);
    writeJsonAtomic(marker, { sha, files: unexpected });
    return { ok: false, sha, files, commands,
      reason: `commit ${sha} contains unexpected files outside the requested scope: ${unexpected.join(', ')}; GPS publication is blocked until you review the commit and explicitly remove ${marker}` };
  }
  return { ok: true, sha, files: files.map((f) => f.slice(prefix.length)) };
}

// Persist the guard before committing: an interruption or a denied journal
// write cannot leave an unverified commit available to a later push.
function commitWithScope(projectRoot, files, pathspecs, message, commands) {
  const marker = gitPrivatePath(projectRoot, UNREVIEWED_COMMIT);
  const blocked = publicationBlock(projectRoot, marker);
  if (blocked) return { ok: false, reason: blocked, commands: [] };
  const before = headSha(projectRoot);
  writeJsonAtomic(marker, { pending: true, before, files });
  try {
    git(projectRoot, ['commit', '-q', '-m', message, '--', ...pathspecs]);
    const result = committedScope(projectRoot, files, commands, marker);
    if (result.ok) fs.unlinkSync(marker);
    return result;
  } catch (err) {
    // A rejected hook with a confirmed unchanged HEAD is safe to retry. Any
    // ambiguity keeps the marker, including a failure after the commit moved HEAD.
    if (before && headSha(projectRoot) === before) fs.unlinkSync(marker);
    throw err;
  }
}

function publicationBlock(projectRoot, marker = gitPrivatePath(projectRoot, UNREVIEWED_COMMIT)) {
  if (!marker) return 'cannot inspect the repository publication guard';
  // Existence is sufficient: corrupt or unreadable journal content cannot
  // accidentally turn a prior scope violation into permission to publish.
  return fs.existsSync(marker)
    ? `an unexpected commit needs review; inspect ${marker}, review its commit, then explicitly remove the file before publishing`
    : null;
}

// The paths in .work/ that gps owns; other skills keep out of them and gps
// keeps out of the rest (docs/WORK-DIR.md).
const GPS_WORK_PATHS = ['.work/gps-config.json', '.work/GLOSSARY.md', '.work/adr', '.work/sessions', '.work/changelog'];

// Commits gps's record (GPS_WORK_PATHS: sessions, glossary, ADRs, project
// config, changelog fragments) as its own commit; anything else that is staged stays staged, and
// other skills' files in .work/ stay out. The session pointer (.current-session),
// the seeds file and the write payloads are committed with the rest; only a
// path the user's own .gitignore covers stays out.
// Never throws: { ok: true, sha, files, skipped } (sha null: nothing to
// commit; skipped: why nothing was tried) or { ok: false, reason, commands }.
function commitWorkDir(projectRoot, message) {
  const none = (skipped) => ({ ok: true, sha: null, files: [], skipped });
  if (!isWorkTree(projectRoot)) return none('not a git repository');
  if (!fs.existsSync(path.join(projectRoot, '.work'))) return none(null);
  const ignored = ignoredPaths(projectRoot, ['.work/', ...GPS_WORK_PATHS]);
  if (ignored.has('.work/')) return none('.work/ is git-ignored');
  // git add fails on a path that is neither on disk nor tracked, and `add -A`
  // on an ignored one: a tracked path the user ignores only gets `add -u`.
  const tracked = trackedPaths(projectRoot, GPS_WORK_PATHS);
  const updateOnly = GPS_WORK_PATHS.filter((p) => tracked.has(p) && ignored.has(p));
  const addAll = GPS_WORK_PATHS.filter((p) => !ignored.has(p)
    && (tracked.has(p) || fs.existsSync(path.join(projectRoot, p))));
  const paths = GPS_WORK_PATHS.filter((p) => addAll.includes(p) || updateOnly.includes(p));
  if (paths.length === 0) return none(null);
  const commands = [`git add -- ${paths.join(' ')}`, `git commit -m ${quote(message)} -- ${paths.join(' ')}`];
  try {
    if (addAll.length > 0) git(projectRoot, ['add', '-A', '--', ...addAll]);
    if (updateOnly.length > 0) git(projectRoot, ['add', '-u', '--', ...updateOnly]);
    // --relative: paths as seen from projectRoot, which may be a subfolder of the repo.
    const files = nulList(git(projectRoot, ['diff', '--cached', '--name-only', '--relative', '--no-renames', '-z', '--', ...paths]));
    if (files.length === 0) return none(null);
    // git commit fails on a directory holding no tracked file, so only the
    // paths with something staged are named.
    const staged = paths.filter((p) => files.some((f) => f === p || f.startsWith(`${p}/`)));
    // Never commit without a pathspec: that would take the whole index.
    if (staged.length === 0) return none(null);
    const committed = commitWithScope(projectRoot, files, staged, message, commands);
    return committed.ok ? { ...committed, skipped: null } : committed;
  } catch (err) {
    return { ok: false, reason: failureReason(err), commands };
  }
}

// Stages exactly `files` (paths relative to projectRoot) and commits them
// with `message`; nothing else that is staged goes in. A tracked file
// deleted from disk is committed as a deletion (the by-hand commands then
// `git rm` it). Never throws:
// { ok: true, sha, files } or { ok: false, reason, commands }.
function commitFiles(projectRoot, files, message) {
  files = files.map((file) => path.relative(projectRoot, path.resolve(projectRoot, file)).split(path.sep).join('/'));
  const present = files.filter((f) => fs.existsSync(path.join(projectRoot, f)));
  const gone = files.filter((f) => !present.includes(f));
  const commands = [
    ...(present.length ? [`git add -- ${present.map(quote).join(' ')}`] : []),
    ...(gone.length ? [`git rm -q -- ${gone.map(quote).join(' ')}`] : []),
    `git commit -m ${quote(message)} -- ${files.map(quote).join(' ')}`,
  ];
  if (!isWorkTree(projectRoot)) return { ok: false, reason: 'not a git repository', commands };
  try {
    if (files.length === 0) throw new Error('give at least one individual file to commit');
    for (const file of files) {
      const rel = path.relative(projectRoot, path.resolve(projectRoot, file));
      if (!rel || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
        throw new Error(`file is outside the project: ${file}`);
      }
      if (fs.existsSync(path.join(projectRoot, file)) && fs.lstatSync(path.join(projectRoot, file)).isDirectory()) {
        throw new Error(`give individual files, not a directory: ${file}`);
      }
    }
    const literalFiles = files.map((f) => `:(literal)${f}`);
    const stagedBefore = nulList(git(projectRoot, ['diff', '--cached', '--name-only', '--relative', '--no-renames', '-z', '--', ...literalFiles]));
    const unstaged = nulList(git(projectRoot, ['diff', '--name-only', '--relative', '--no-renames', '-z', '--', ...literalFiles]));
    const partial = stagedBefore.filter((f) => unstaged.includes(f));
    if (partial.length > 0) throw new Error(`partially staged files need review before committing: ${partial.join(', ')}`);
    // `git add` of a deleted path under an ignored directory fails (even when
    // tracked), `git rm --cached` does not; the pathspec commit then takes
    // each path as it is on disk.
    if (present.length) git(projectRoot, ['add', '--', ...present.map((f) => `:(literal)${f}`)]);
    // A failed hook can leave deletions already staged. Keep them staged on
    // retry rather than asking git rm to remove an index entry that is gone.
    const unstagedDeletions = gone.filter((f) => !stagedBefore.includes(f));
    if (unstagedDeletions.length) git(projectRoot, ['rm', '-q', '--cached', '--', ...unstagedDeletions.map((f) => `:(literal)${f}`)]);
    const staged = nulList(git(projectRoot, ['diff', '--cached', '--name-only', '--relative', '-z', '--', ...literalFiles]));
    if (staged.length === 0) return { ok: false, reason: 'none of the given files has changes to commit', commands };
    return commitWithScope(projectRoot, files, literalFiles, message, commands);
  } catch (err) {
    return { ok: false, reason: failureReason(err), commands };
  }
}

// Puts `files` back as they are in HEAD, on disk and in the index (e.g.
// files deleted for a commit that failed). Never throws:
// { ok: true } or { ok: false, reason, commands }.
function restoreFromHead(projectRoot, files) {
  const commands = [`git checkout HEAD -- ${files.map(quote).join(' ')}`];
  if (files.length === 0) return { ok: true };
  try {
    git(projectRoot, ['checkout', 'HEAD', '--', ...files]);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: failureReason(err), commands };
  }
}

// Tracked files that differ from HEAD (modified, staged, deleted or added),
// relative to projectRoot. Never throws: { ok: true, files } or { ok: false, reason }.
function changedTrackedFiles(projectRoot) {
  try {
    return { ok: true, files: nulList(git(projectRoot, ['diff', '--name-only', '--relative', '--no-renames', '-z', 'HEAD'])) };
  } catch (err) {
    return { ok: false, reason: failureReason(err) };
  }
}

// Files git neither tracks nor ignores, relative to projectRoot. [] on any error.
function untrackedFiles(projectRoot) {
  return nulList(tryGit(projectRoot, ['ls-files', '--others', '--exclude-standard', '-z']));
}

// Puts every tracked file back as it is in HEAD, on disk and in the index; a
// file added to the index since HEAD is removed again. Untracked files stay.
// Never throws: { ok: true } or { ok: false, reason, commands }.
function discardTrackedChanges(projectRoot) {
  const commands = ['git checkout HEAD -- .'];
  try {
    const diff = (filter) => nulList(git(projectRoot, ['diff', '--name-only', '--relative', '--no-renames', `--diff-filter=${filter}`, '-z', 'HEAD']));
    const added = diff('A');
    const rest = diff('MDTUXB');
    if (added.length) git(projectRoot, ['rm', '-q', '-f', '--', ...added.map((f) => `:(literal)${f}`)]);
    if (rest.length) git(projectRoot, ['checkout', 'HEAD', '--', ...rest.map((f) => `:(literal)${f}`)]);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: failureReason(err), commands };
  }
}

// What a commitWorkDir result means for the user: { line, warning }, either
// null (nothing to say outside a git repository or with nothing to commit).
function describeWorkCommit(record) {
  if (record.ok && record.sha) {
    return { line: `🗂️  Session record committed (${record.sha}): ${record.files.length} file(s) in .work/`, warning: null };
  }
  if (record.ok) {
    return { line: null, warning: record.skipped === '.work/ is git-ignored' ? 'Session record not committed: .work/ is git-ignored.' : null };
  }
  return { line: null, warning: `Session record not committed (${record.reason}). Run by hand: ${record.commands.join(' && ')}` };
}

// Never throws: { ok: true } or { ok: false, reason }.
function pushBranch(projectRoot, branch) {
  try {
    const blocked = publicationBlock(projectRoot);
    if (blocked) return { ok: false, reason: blocked };
    git(projectRoot, ['push', '-u', 'origin', branch]);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: failureReason(err) };
  }
}

// Full commit messages (subject and body, trailing whitespace trimmed),
// newest first: of `base..branch`, or made since `since` (unix seconds).
// [] on any error.
function commitMessages(projectRoot, { base, branch, since }) {
  const args = ['log', '--format=%B%x00'];
  if (since !== undefined) args.push(`--since=@${Math.floor(since)}`);
  else args.push(`${base}..${branch}`);
  return nulList(tryGit(projectRoot, args)).map((m) => m.trim()).filter(Boolean);
}

// The branch releases come from: origin's default (origin/HEAD), else a
// local main or master. null when none is found.
function defaultBranch(projectRoot) {
  const remote = tryGit(projectRoot, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
  if (remote) return remote.replace(/^origin\//, '');
  return ['main', 'master'].find((b) => tryGit(projectRoot, ['rev-parse', '--verify', '--quiet', `refs/heads/${b}`]) !== null) || null;
}

// True when nothing is modified, staged or untracked (false outside a repo).
function isCleanTree(projectRoot) {
  return tryGit(projectRoot, ['status', '--porcelain', '--untracked-files=all']) === '';
}

function tagExists(projectRoot, tag) {
  return tryGit(projectRoot, ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`]) !== null;
}

// Annotated tag on HEAD. Never throws: { ok: true } or { ok: false, reason, commands }.
function createTag(projectRoot, tag, message) {
  try {
    git(projectRoot, ['tag', '-a', tag, '-m', message]);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: failureReason(err), commands: [`git tag -a ${tag} -m ${quote(message)}`] };
  }
}

// Subject, body and tags (those pointing at it) of HEAD; null without a commit.
function headCommit(projectRoot) {
  const subject = tryGit(projectRoot, ['log', '-1', '--format=%s']);
  if (subject === null) return null;
  return {
    subject,
    body: tryGit(projectRoot, ['log', '-1', '--format=%b']) || '',
    tags: lines(tryGit(projectRoot, ['tag', '--points-at', 'HEAD'])),
  };
}

// Pushes `branch` and the annotated tags on it. Never throws:
// { ok: true, commands } or { ok: false, reason, commands }.
function pushWithTags(projectRoot, branch) {
  const commands = [`git push --atomic --follow-tags origin ${branch}`];
  try {
    const blocked = publicationBlock(projectRoot);
    if (blocked) return { ok: false, reason: blocked, commands: [] };
    git(projectRoot, ['push', '--atomic', '--follow-tags', 'origin', branch]);
    return { ok: true, commands };
  } catch (err) {
    return { ok: false, reason: failureReason(err), commands };
  }
}

// True when origin has `tag` (false on any error, including no origin).
function remoteHasTag(projectRoot, tag) {
  return Boolean(tryGit(projectRoot, ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`]));
}

// The sha origin holds for `branch`, or null (no origin, no such branch).
function remoteBranchAt(projectRoot, branch) {
  const out = tryGit(projectRoot, ['ls-remote', 'origin', `refs/heads/${branch}`]);
  return out ? out.split(/\s+/)[0] : null;
}

// Fetches origin's `branch` (updating origin/<branch>) and counts the
// commits it has that HEAD lacks. Changes no tracked file. Never throws:
// { ok: true, behind } or { ok: false, reason } (no origin, fetch failed).
function fetchBehind(projectRoot, branch) {
  if (!originUrl(projectRoot)) return { ok: false, reason: 'no origin remote' };
  try {
    git(projectRoot, ['fetch', '-q', 'origin', `+refs/heads/${branch}:refs/remotes/origin/${branch}`]);
    return { ok: true, behind: Number(git(projectRoot, ['rev-list', '--count', `HEAD..refs/remotes/origin/${branch}`])) };
  } catch (err) {
    return { ok: false, reason: failureReason(err) };
  }
}

// Full sha of HEAD, or null without a commit.
function headSha(projectRoot) {
  return tryGit(projectRoot, ['rev-parse', 'HEAD']);
}

module.exports = {
  DEFAULT_MAX_COMMITS,
  BRANCH_TYPES,
  BRANCH_PATTERN,
  safeGitArgs,
  failureReason,
  isWorkTree,
  gitPrivatePath,
  originUrl,
  currentBranch,
  sessionBaseBranch,
  branchesHolding,
  commitExists,
  describeCommit,
  readRecentCommits,
  commitsBetween,
  readGitStatus,
  validateBranchName,
  branchType,
  createSessionBranch,
  switchBranch,
  isTracked,
  pathHasChanges,
  isIgnored,
  commitRemainingChanges,
  GPS_WORK_PATHS,
  commitWorkDir,
  describeWorkCommit,
  commitFiles,
  restoreFromHead,
  changedTrackedFiles,
  untrackedFiles,
  discardTrackedChanges,
  pushBranch,
  commitMessages,
  defaultBranch,
  isCleanTree,
  tagExists,
  createTag,
  headCommit,
  pushWithTags,
  remoteHasTag,
  remoteBranchAt,
  headSha,
  fetchBehind,
};
