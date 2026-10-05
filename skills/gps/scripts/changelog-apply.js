#!/usr/bin/env node

/**
 * changelog-apply.js --bump <patch|minor|major> [--reason "<why>"] [--file <path>] [--json]
 *
 * /gps finish, step 2 (after changelog-prepare.js and Claude's payload).
 * Validates the bump (not below the floor the session's commits set; above it
 * only with --reason) and the payload (default: the session's
 * .changelog-payload.md), writes the session's entry into the CHANGELOG's
 * Unreleased block, commits that file alone as `docs(changelog): <feature>`,
 * records the bump in .session-config.json and deletes the payload. Writes
 * nothing unless every check passes. A failed commit only warns: the file
 * stays written.
 */

const fs = require('fs');
const path = require('path');
const { main } = require('./lib/cli');
const { resolveSession } = require('./lib/session-store');
const { changelogSettings } = require('./lib/project-config');
const { detectFormat, parsePayload, upsertSessionEntry } = require('./lib/changelog');
const { checkChangelogable, sessionCommits } = require('./lib/changelog-session');
const { LEVELS, levelRank } = require('./lib/semver');
const { commitFiles } = require('./lib/git');
const { recordEvent } = require('./lib/history');
const { GpsError, UsageError, writeJsonAtomic } = require('./lib/guard');

// commitFiles' reason when the file matches HEAD.
const NOTHING_TO_COMMIT = 'none of the given files has changes to commit';

function apply({ options, projectRoot, warn }) {
  if (!options.bump) throw new UsageError('--bump <patch|minor|major> is required.');
  if (!LEVELS.includes(options.bump)) {
    throw new UsageError(`Unknown bump level "${options.bump}". Use one of: ${LEVELS.join(', ')}.`);
  }
  const bump = options.bump;
  const { sessionId, sessionDir, configPath, config } = resolveSession(projectRoot);
  checkChangelogable(sessionId, sessionDir, config);
  const settings = changelogSettings(projectRoot);
  if (!settings.enabled) {
    throw new GpsError('Changelog is disabled (changelog.enabled = false); nothing was changed.',
      'Run finish.js to finish without a CHANGELOG entry.');
  }

  const { floor } = sessionCommits(projectRoot, config);
  if (levelRank(bump) < levelRank(floor)) {
    throw new GpsError(`Bump "${bump}" is below the floor "${floor}" set by the session's commits.`,
      `Run changelog-apply.js --bump ${floor} (or higher with --reason).`);
  }
  const reason = options.reason || null;
  if (levelRank(bump) > levelRank(floor) && !reason) {
    throw new GpsError(`Bump "${bump}" is above the floor "${floor}" set by the session's commits: say why.`,
      `Run changelog-apply.js --bump ${bump} --reason "<why>".`);
  }

  const defaultPayload = path.join(sessionDir, '.changelog-payload.md');
  const payloadPath = options.file ? path.resolve(projectRoot, options.file) : defaultPayload;
  if (!fs.existsSync(payloadPath)) {
    throw new GpsError(`No payload at ${payloadPath}; nothing was changed.`,
      'Run changelog-prepare.js, write the bullets to its payload path, then run this again.');
  }

  const file = path.join(projectRoot, settings.path);
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : null;
  const format = detectFormat(existing);
  const entry = parsePayload(fs.readFileSync(payloadPath, 'utf-8'), format);
  const updated = upsertSessionEntry(existing, { sessionId, bump, entry });
  const count = entry.bullets ? entry.bullets.length : Object.values(entry.sections).reduce((n, b) => n + b.length, 0);

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, updated);
  if (format === 'unknown') warn('Unrecognised CHANGELOG.md structure: check the result.');

  const record = commitFiles(projectRoot, [settings.path], `docs(changelog): ${config.feature_name}`);
  // An identical re-run leaves nothing to commit: the entry is already there.
  const unchanged = !record.ok && record.reason === NOTHING_TO_COMMIT;
  if (!record.ok && !unchanged) {
    warn(`${settings.path} written but not committed (${record.reason}). Run by hand: ${record.commands.join(' && ')}`);
  }

  config.changelog = { bump, floor, reason, written_at: new Date().toISOString() };
  writeJsonAtomic(configPath, config);
  recordEvent(configPath, config, sessionDir, { event: 'changelog_written', detail: { bump } });
  if (payloadPath === defaultPayload) fs.unlinkSync(payloadPath);

  const committed = record.ok ? `committed (${record.sha})` : unchanged ? 'unchanged, already committed' : 'not committed';
  return {
    text: `📝 ${settings.path}: ${bump} (${count} bullet(s)) ${committed}\nNext: finish.js`,
    data: { sessionId, path: settings.path, bump, floor, reason, bullets: count, record },
  };
}

main({
  usage: 'changelog-apply.js --bump <patch|minor|major> [--reason "<why>"] [--file <path>] [--json]',
  options: { bump: 'string', reason: 'string', file: 'string' },
  run: apply,
});
