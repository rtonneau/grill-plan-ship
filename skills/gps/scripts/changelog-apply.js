#!/usr/bin/env node

/**
 * changelog-apply.js --bump <patch|minor|major> [--reason "<why>"] [--file <path>] [--json]
 *
 * /gps finish, step 2 (after changelog-prepare.js and Claude's payload).
 * Validates the bump (not below the floor the session's commits set; above it
 * only with --reason) and the payload (default: the session's
 * .changelog-payload.md) against the CHANGELOG's format, then writes the
 * session's fragment, .work/changelog/<session-id>.md (replacing an earlier
 * one), records the bump in .session-config.json and deletes the payload.
 * CHANGELOG.md is never touched: release.js merges the fragments. Nothing is
 * committed here: finish.js commits the fragment with the session record.
 * Writes nothing unless every check passes.
 */

const fs = require('fs');
const path = require('path');
const { main } = require('./lib/cli');
const { resolveSession } = require('./lib/session-store');
const { changelogSettings } = require('./lib/project-config');
const { detectFormat, parsePayload } = require('./lib/changelog');
const { writeFragment } = require('./lib/changelog-fragments');
const { checkChangelogable, sessionCommits } = require('./lib/changelog-session');
const { LEVELS, levelRank } = require('./lib/semver');
const { recordEvent } = require('./lib/history');
const { GpsError, UsageError, writeJsonAtomic } = require('./lib/guard');

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
  if (reason && /[\r\n]/.test(reason)) throw new UsageError('--reason must be a single line.');

  const defaultPayload = path.join(sessionDir, '.changelog-payload.md');
  const payloadPath = options.file ? path.resolve(projectRoot, options.file) : defaultPayload;
  if (!fs.existsSync(payloadPath)) {
    throw new GpsError(`No payload at ${payloadPath}; nothing was changed.`,
      'Run changelog-prepare.js, write the bullets to its payload path, then run this again.');
  }

  const file = path.join(projectRoot, settings.path);
  const format = detectFormat(fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : null);
  const payload = fs.readFileSync(payloadPath, 'utf-8');
  const entry = parsePayload(payload, format);
  const count = entry.bullets ? entry.bullets.length : Object.values(entry.sections).reduce((n, b) => n + b.length, 0);
  if (format === 'unknown') warn(`Unrecognised ${settings.path} structure: check the release section /gps release writes.`);

  const fragment = writeFragment(projectRoot, sessionId, { bump, floor, reason, body: payload });
  config.changelog = { bump, floor, reason, bullets: count, path: fragment, written_at: new Date().toISOString() };
  writeJsonAtomic(configPath, config);
  recordEvent(configPath, config, sessionDir, { event: 'changelog_written', detail: { bump } });
  if (payloadPath === defaultPayload) fs.unlinkSync(payloadPath);

  return {
    text: `📝 Changelog fragment: ${bump} (${count} bullet(s)) → ${fragment}\nNext: finish.js`,
    data: { sessionId, path: fragment, bump, floor, reason, bullets: count },
  };
}

main({
  usage: 'changelog-apply.js --bump <patch|minor|major> [--reason "<why>"] [--file <path>] [--json]',
  options: { bump: 'string', reason: 'string', file: 'string' },
  run: apply,
});
