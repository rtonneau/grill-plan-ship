#!/usr/bin/env node

/**
 * changelog-prepare.js [--json]
 *
 * /gps finish, step 1: gathers what Claude needs to draft the session's
 * CHANGELOG entry: the session's commits (gps's own left out), the bump floor
 * they imply, the CHANGELOG's format and its current Unreleased block, and
 * the payload path to write the bullets to. changelog-apply.js writes them.
 * Changes nothing.
 */

const fs = require('fs');
const path = require('path');
const { main } = require('./lib/cli');
const { resolveSession } = require('./lib/session-store');
const { changelogSettings } = require('./lib/project-config');
const { detectFormat, readUnreleased } = require('./lib/changelog');
const { checkChangelogable, sessionCommits } = require('./lib/changelog-session');

const PAYLOAD_FILENAME = '.changelog-payload.md';

main({
  usage: 'changelog-prepare.js [--json]',
  run({ projectRoot }) {
    const { sessionId, sessionDir, config } = resolveSession(projectRoot);
    checkChangelogable(sessionId, sessionDir, config);
    const settings = changelogSettings(projectRoot);
    const payloadPath = path.join(sessionDir, PAYLOAD_FILENAME);
    if (!settings.enabled) {
      return {
        text: 'Changelog disabled (changelog.enabled = false).\nNext: finish.js',
        data: { enabled: false, path: settings.path, payloadPath },
      };
    }

    const file = path.join(projectRoot, settings.path);
    const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : null;
    const format = detectFormat(existing);
    const unreleased = readUnreleased(existing || '');
    const { subjects, floor } = sessionCommits(projectRoot, config);
    const rerun = unreleased.sessions.includes(sessionId);

    const lines = [
      `${settings.path}: format ${format}, bump floor ${floor}${rerun ? '; this session already has an entry (it is replaced)' : ''}.`,
      'Commits:',
      ...(subjects.length > 0 ? subjects.map((s) => `- ${s}`) : ['- (none found)']),
      'Unreleased now:',
      unreleased.body || '(empty)',
      '',
      format === 'sections'
        ? 'Write "- " bullets under "### Added|Changed|Deprecated|Removed|Fixed|Security" headings'
        : 'Write plain "- " bullets',
      `to ${payloadPath}, then run changelog-apply.js --bump <${floor} or higher> [--reason "<why higher>"].`,
      `Next: changelog-apply.js`,
    ];
    return {
      text: lines.join('\n'),
      data: { enabled: true, path: settings.path, format, floor, commits: subjects, unreleased: unreleased.body, rerun, payloadPath },
    };
  },
});
