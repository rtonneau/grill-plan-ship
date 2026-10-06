// tests/lib/changelog.test.js
const assert = require('assert');
const {
  unreleasedHasEntries, latestVersion, sectionNotes, renderRelease,
  SECTIONS, NEW_FILE_HEADER, VERSION_HEADING_RE, detectFormat, readUnreleased, parsePayload,
} = require('../../skills/gps/scripts/lib/changelog');
const changelog = require('../../skills/gps/scripts/lib/changelog');
const { UsageError } = require('../../skills/gps/scripts/lib/guard');

const GPS_HEAD = `# Changelog

All notable changes to grill-plan-ship. Versions follow [semantic versioning](https://semver.org/).

## 2.5.1

- **\`/gps auto\` recommends subagent + inline follow-up.** When it asks the ship mode, it puts it first.
- **README: no parallel tickets.** It now states that no ship mode runs tickets in parallel.

## 2.5.0

- **Shared \`.work/\`.** gps now commits only its own paths in \`.work/\`.
`;
const KEEP = `# Changelog

## [1.0.0] - 2026-01-01

### Added

- first
`;

assert.deepStrictEqual(SECTIONS, ['Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security']);
assert.strictEqual(NEW_FILE_HEADER.endsWith('semver.org/).\n'), true);

// VERSION_HEADING_RE
for (const h of ['## 2.5.1', '## 2.5.1 (2026-01-01)', '## [2.5.1] - 2026-01-01', '## v2.5.1']) {
  assert.strictEqual(h.match(VERSION_HEADING_RE)[1], '2.5.1', h);
}
assert.strictEqual(VERSION_HEADING_RE.test('## Unreleased'), false);

// detectFormat
assert.strictEqual(detectFormat(null), 'new');
assert.strictEqual(detectFormat(''), 'new');
assert.strictEqual(detectFormat(GPS_HEAD), 'plain');
assert.strictEqual(detectFormat(KEEP), 'sections');
assert.strictEqual(detectFormat('## Notes\n\n- x\n'), 'unknown');

// readUnreleased: the hand-written body only (no gps markers any more)
assert.deepStrictEqual(readUnreleased(GPS_HEAD), { exists: false, body: '' });
assert.deepStrictEqual(readUnreleased('# C\n\n## [Unreleased]\n\n- hand\n\n## 1.0.0\n\n- x\n'), { exists: true, body: '- hand' });
assert.deepStrictEqual(readUnreleased(null), { exists: false, body: '' });

// The marker API is gone.
for (const name of ['upsertSessionEntry', 'readBumpMarkers', 'unknownBumpLevels', 'cutRelease']) {
  assert.strictEqual(changelog[name], undefined, name);
}

// parsePayload
assert.deepStrictEqual(parsePayload('- a\n- b\n', 'plain'), { bullets: ['- a', '- b'] });
assert.deepStrictEqual(parsePayload('- a', 'unknown'), { bullets: ['- a'] });
assert.deepStrictEqual(parsePayload('### Fixed\n- y\n\n### Added\n- x\n- z', 'sections'), { sections: { Fixed: ['- y'], Added: ['- x', '- z'] } });
for (const [payload, format] of [
  ['just prose', 'plain'],
  ['', 'new'],
  ['### Fixes\n- y', 'sections'],
  ['### Fixed\n- y', 'plain'],
  ['### Fixed\n- y', 'new'],
  ['- y\n### Fixed\n- z', 'sections'],
  ['- y', 'sections'],
  ['### Fixed\n', 'sections'],
]) {
  assert.throws(() => parsePayload(payload, format), UsageError, `${format}: ${payload}`);
}

// nested bullets: continuation lines belong to the bullet above
assert.deepStrictEqual(parsePayload('- **Lead:**\n  - sub one\n  - sub two\n- next', 'plain'),
  { bullets: ['- **Lead:**\n  - sub one\n  - sub two', '- next'] });
assert.deepStrictEqual(parsePayload('### Fixed\n- a\n  more\n', 'sections'), { sections: { Fixed: ['- a\n  more'] } });
assert.throws(() => parsePayload('  - orphan\n- a', 'plain'), UsageError);
assert.throws(() => parsePayload('### Fixed\n  - orphan', 'sections'), UsageError);

// unreleasedHasEntries, latestVersion
assert.strictEqual(unreleasedHasEntries(GPS_HEAD), false);
assert.strictEqual(unreleasedHasEntries('# C\n\n## Unreleased\n\n- hand\n'), true);
assert.strictEqual(unreleasedHasEntries('# C\n\n## Unreleased\n\n## 1.0.0\n\n- x\n'), false);
assert.strictEqual(latestVersion(GPS_HEAD), '2.5.1');
assert.strictEqual(latestVersion('# C\n\n## v1.2.3\n'), '1.2.3');
assert.strictEqual(latestVersion('# C\n'), null);

// renderRelease: hand bullets plus fragment bodies into the version section
const RD = '2026-10-06';
const plainFile = '# Changelog\n\n## Unreleased\n\n- hand\n\n## [1.0.0] - 2026-01-01\n\n- first\n';
const r1 = renderRelease(plainFile, '1.1.0', RD, ['- a', '- b\n  more']);
assert.ok(r1.includes('## 1.1.0 (2026-10-06)\n\n- hand\n- a\n- b\n  more\n\n## [1.0.0] - 2026-01-01\n\n- first\n'));
assert.ok(!/Unreleased/.test(r1));
const secFile = '# Changelog\n\n## [Unreleased]\n\n### Fixed\n\n- x\n\n## [1.0.0] - 2026-01-01\n\n### Added\n\n- first\n';
const r2 = renderRelease(secFile, '1.0.1', RD, ['### Fixed\n- y']);
assert.ok(r2.includes('## 1.0.1 (2026-10-06)\n\n### Fixed\n\n- x\n- y\n\n## [1.0.0]'));
assert.ok(!/Unreleased/.test(r2));
const r3 = renderRelease(KEEP, '1.1.0', RD, ['- plain']);
assert.ok(r3.includes('## 1.1.0 (2026-10-06)\n\n### Changed\n\n- plain\n\n## [1.0.0] - 2026-01-01\n\n### Added\n\n- first\n'));
const r4 = renderRelease(plainFile, '1.1.0', RD, ['### Fixed\n- f\n### Added\n- ad']);
assert.ok(r4.includes('- hand\n- ad\n- f\n'));
assert.ok(!r4.includes('###'));
const r5 = renderRelease(KEEP, '2.0.0', RD, ['### Added\n- n']);
assert.ok(r5.startsWith('# Changelog\n\n## 2.0.0 (2026-10-06)\n\n### Added\n\n- n\n\n## [1.0.0]'));
const r6 = renderRelease(null, '0.1.0', RD, ['- first']);
assert.ok(r6.startsWith(NEW_FILE_HEADER) && r6.includes('## 0.1.0 (2026-10-06)\n\n- first\n'));
const noVer = renderRelease('# Changelog\n\nIntro text.\n', '0.1.0', RD, ['- a']);
assert.ok(noVer.includes('Intro text.\n\n## 0.1.0 (2026-10-06)\n\n- a\n'));
const r7 = renderRelease(plainFile.replace(/\n/g, '\r\n'), '1.1.0', RD, ['- a']);
assert.ok(r7.includes('## 1.1.0 (2026-10-06)\r\n') && !/[^\r]\n/.test(r7));
assert.ok(r7.endsWith('## [1.0.0] - 2026-01-01\r\n\r\n- first\r\n'));
// A body is copied as written (an HTML comment in it is kept).
assert.ok(renderRelease(plainFile, '1.1.0', RD, ['- a <!-- note -->']).includes('- a <!-- note -->'));

// sectionNotes: the body of a released section
assert.strictEqual(sectionNotes(r1, '1.1.0'), '- hand\n- a\n- b\n  more');
assert.strictEqual(sectionNotes(r1, '9.9.9'), '');

console.log('changelog.test.js: all assertions passed');
