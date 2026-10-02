// tests/lib/commit-log.test.js
const assert = require('assert');
const { loadTemplate, renderTemplate } = require('../../skills/gps/scripts/lib/templates');
const {
  STATUS_DONE, unfilledSections, setSection, completeLog, blockLog, recordedCommits, formatDuration,
} = require('../../skills/gps/scripts/lib/commit-log');
const { isTicketDone } = require('../../skills/gps/scripts/lib/ticket-queue');

const fresh = renderTemplate(loadTemplate('03-implement-log.md'), { N: '02', slug: 'wire-cli' });
const filled = fresh.replace(/<!--\s*gps:fill[\s\S]*?-->/g, 'Checked.');

// Only the narrative sections count as unfilled; script sections never do.
assert.deepStrictEqual(unfilledSections(fresh), ['Local Test Result', 'Review Notes', 'Blockers / Challenges']);
assert.deepStrictEqual(unfilledSections(filled), []);
assert.deepStrictEqual(unfilledSections('## Review Notes\n\n'), ['Review Notes'], 'an empty section is unfilled');
// Older logs had gps:fill markers in Commits / Time Spent: ignored.
assert.deepStrictEqual(unfilledSections(`${filled}\n## Commits\n\n- <!-- gps:fill hash -->\n`), []);

// setSection replaces one body, keeps the rest; appends a missing section.
const text = '# T\n\n## A\n\nold\n\n## B\n\nkeep\n';
assert.strictEqual(setSection(text, 'A', 'new'), '# T\n\n## A\n\nnew\n\n## B\n\nkeep\n');
assert.strictEqual(setSection(text, 'B', 'last'), '# T\n\n## A\n\nold\n\n## B\n\nlast\n');
assert.strictEqual(setSection(text, 'C', 'added'), `${text.trimEnd()}\n\n## C\n\nadded\n`);

// completeLog: Done, commits, time spent, token usage; the narrative kept.
const done = completeLog(filled, {
  commits: ['abc1234 feat: wire cli'],
  startedAt: '2026-10-02T10:00:00.000Z',
  finishedAt: '2026-10-02T11:05:20.000Z',
  usage: { available: true, input: 1, output: 2, cacheRead: 3, cacheCreation: 4, total: 10 },
});
assert.ok(done.includes(STATUS_DONE));
assert.ok(isTicketDone.length === 1);
assert.match(done, /## Commits\n\n- abc1234 feat: wire cli\n/);
assert.match(done, /## Time Spent\n\n1h 05m \(ticket-start\.js to ticket-complete\.js\)/);
assert.match(done, /## Token Usage\n\n- \*\*Input:\*\* 1\n[\s\S]*- \*\*Total:\*\* 10\n$/);
assert.match(done, /## Review Notes\n\nChecked\./);
assert.doesNotMatch(done, /Filled by ticket-complete\.js/);
assert.deepStrictEqual(recordedCommits(done), ['abc1234']);
assert.deepStrictEqual(recordedCommits(fresh), []);
assert.match(completeLog(filled, { commits: ['x'], startedAt: null, finishedAt: 'now', usage: null }), /## Time Spent\n\nunknown/);

// formatDuration
assert.strictEqual(formatDuration('2026-10-02T10:00:00Z', '2026-10-02T10:00:40Z'), '1m');
assert.strictEqual(formatDuration('2026-10-02T10:00:00Z', '2026-10-02T12:00:00Z'), '2h 00m');
assert.strictEqual(formatDuration('bad', '2026-10-02T12:00:00Z'), null);
assert.strictEqual(formatDuration('2026-10-02T12:00:00Z', '2026-10-02T10:00:00Z'), null);

// blockLog: In Progress, reason recorded; an earlier filled reason kept.
const blocked = blockLog(done, 'needs a key', '2026-10-02T12:00:00.000Z');
assert.match(blocked, /\*\*Status:\*\* In Progress/);
assert.match(blocked, /## Blockers \/ Challenges\n\nChecked\.\n\n\*\*Blocked \(2026-10-02T12:00:00\.000Z\):\*\* needs a key/);
assert.match(blockLog(fresh, 'x', 't'), /## Blockers \/ Challenges\n\n\*\*Blocked \(t\):\*\* x\n/);
assert.match(blockLog('no status line\n', 'x', 't'), /^\*\*Status:\*\* In Progress\n/);

console.log('commit-log.test.js: all assertions passed');
