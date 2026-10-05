// tests/lib/changelog.test.js
const assert = require('assert');
const {
  SECTIONS, NEW_FILE_HEADER, VERSION_HEADING_RE, detectFormat, readUnreleased, parsePayload, upsertSessionEntry,
} = require('../../skills/gps/scripts/lib/changelog');
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
const bullets = (...b) => ({ bullets: b });
const up = (text, sessionId, bump, entry) => upsertSessionEntry(text, { sessionId, bump, entry });

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

// new file
const created = up(null, 's1', 'minor', bullets('- **A.** x'));
assert.ok(created.startsWith(NEW_FILE_HEADER));
assert.ok(created.includes('## Unreleased\n\n- **A.** x <!-- gps:s1 -->\n<!-- gps:bump=minor session=s1 -->'));
assert.ok(created.endsWith('\n'));
assert.deepStrictEqual(readUnreleased(created).sessions, ['s1']);
assert.strictEqual(readUnreleased(GPS_HEAD).exists, false);

// insertion before the first version heading
const gps = up(GPS_HEAD, 's1', 'patch', bullets('- **B.** y'));
assert.ok(gps.includes('\n\n## Unreleased\n\n- **B.** y <!-- gps:s1 -->\n<!-- gps:bump=patch session=s1 -->\n\n## 2.5.1\n'));
assert.ok(gps.endsWith(GPS_HEAD.slice(GPS_HEAD.indexOf('## 2.5.1'))));
const keep = up(KEEP, 's1', 'patch', { sections: { Fixed: ['- z'] } });
assert.ok(keep.includes('## Unreleased\n\n### Fixed\n\n- z <!-- gps:s1 -->\n<!-- gps:bump=patch session=s1 -->\n\n## [1.0.0] - 2026-01-01'));

// unknown format: after the first line; no heading at all: end of file
const unk = up('## Notes\n\n- x\n', 's1', 'patch', bullets('- n'));
assert.ok(unk.startsWith('## Notes\n\n## Unreleased\n\n- n <!-- gps:s1 -->'));
assert.ok(unk.endsWith('\n\n- x\n'));
const noVersions = up('# Changelog\n\nintro\n', 's1', 'patch', bullets('- n'));
assert.strictEqual(noVersions, '# Changelog\n\nintro\n\n## Unreleased\n\n- n <!-- gps:s1 -->\n<!-- gps:bump=patch session=s1 -->\n');

// re-run replaces own entry, keeps others byte-identical
let text = up(GPS_HEAD, 's1', 'minor', bullets('- one', '- two'));
text = text.replace('## Unreleased\n\n', '## Unreleased\n\n- hand\n');
text = up(text, 's2', 'patch', bullets('- other'));
const rerun = up(text, 's1', 'major', bullets('- three'));
assert.ok(!rerun.includes('- one') && !rerun.includes('- two'));
assert.ok(rerun.includes('- three <!-- gps:s1 -->'));
assert.ok(rerun.includes('- hand\n'));
assert.ok(rerun.includes('- other <!-- gps:s2 -->\n'));
assert.ok(rerun.includes('<!-- gps:bump=patch session=s2 -->'));
assert.ok(!rerun.includes('bump=minor'));
assert.strictEqual(rerun.trimEnd().split('\n').filter((l) => l.includes('session=s1 -->')).length, 1);
assert.ok(rerun.indexOf('session=s1 -->') > rerun.indexOf('- three'));
assert.deepStrictEqual(readUnreleased(rerun).sessions.sort(), ['s1', 's2']);
assert.strictEqual(up(rerun, 's1', 'major', bullets('- three')), rerun);

// sections format merge and creation order
let sec = up(KEEP, 's1', 'minor', { sections: { Added: ['- a2'], Security: ['- sec'] } });
sec = up(sec, 's2', 'patch', { sections: { Fixed: ['- y'], Changed: ['- c'] } });
const order = ['### Added', '### Changed', '### Fixed', '### Security'].map((h) => sec.indexOf(h));
assert.ok(order.every((i) => i > 0) && order.join() === [...order].sort((a, b) => a - b).join());
sec = up(sec, 's3', 'patch', { sections: { Fixed: ['- y2'] } });
assert.strictEqual(sec.split('### Fixed').length, 2);
assert.ok(sec.includes('- y <!-- gps:s2 -->\n- y2 <!-- gps:s3 -->'));
assert.ok(sec.includes('- first\n'));

// CRLF
const crlf = up(GPS_HEAD.replace(/\n/g, '\r\n'), 's1', 'patch', bullets('- x'));
assert.ok(!/(^|[^\r])\n/.test(crlf));
assert.ok(crlf.includes('## Unreleased\r\n'));

// bump validation
assert.throws(() => up(null, 's1', 'huge', bullets('- x')), /bump/);

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

console.log('changelog.test.js: all assertions passed');
