// scripts/lib/history.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { localDate } = require('./guard');
const {
  recordEvent, getHistory, backfillHistory, ensureHistory, hasEvent, sessionPath, renderTimeline,
} = require('./history');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gps-history-'));
const sessionDir = path.join(tmp, '2026-09-25__demo');
fs.mkdirSync(path.join(sessionDir, '01-grill'), { recursive: true });
const configPath = path.join(sessionDir, '.session-config.json');
const resumePath = path.join(sessionDir, '01-grill', 'resume.md');
fs.writeFileSync(resumePath, '# Session\n\n<!-- gps:fill Problem -->\n');
const load = () => JSON.parse(fs.readFileSync(configPath, 'utf-8'));

// recordEvent: appends, derives the phase, updates current_phase, persists.
const config = {
  session_id: 'demo', feature_name: 'Demo', created_at: '2026-09-25T09:00:00.000Z', template_version: 2, history: [],
};
fs.writeFileSync(configPath, JSON.stringify(config));
assert.strictEqual(
  recordEvent(configPath, config, sessionDir, { event: 'session_started', files: ['01-grill/resume.md'], at: config.created_at }),
  true
);
let saved = load();
assert.deepStrictEqual(saved.history, [
  { at: '2026-09-25T09:00:00.000Z', event: 'session_started', phase: 'grill', files: ['01-grill/resume.md'] },
]);
assert.strictEqual(saved.current_phase, 'grill');

// The phase follows the files: a filled resume means plan-not-started.
// Empty files/detail are omitted; `at` defaults to now.
fs.writeFileSync(resumePath, '# Session\n\nApproved.\n');
recordEvent(configPath, config, sessionDir, { event: 'grill_written', files: [], detail: {} });
saved = load();
const written = saved.history[1];
assert.strictEqual(written.event, 'grill_written');
assert.strictEqual(written.phase, 'plan-not-started');
assert.ok(!('files' in written) && !('detail' in written));
assert.ok(!Number.isNaN(Date.parse(written.at)));
assert.strictEqual(saved.current_phase, 'plan-not-started');

recordEvent(configPath, config, sessionDir, { event: 'handoff_saved', files: ['HANDOFF.md'], detail: { note: 'x' } });
assert.deepStrictEqual(load().history[2].detail, { note: 'x' });
assert.strictEqual(hasEvent(config, 'handoff_saved'), true);
assert.strictEqual(hasEvent(config, 'handoff_saved', { note: 'x' }), true);
assert.strictEqual(hasEvent(config, 'handoff_saved', { note: 'y' }), false);
assert.strictEqual(hasEvent(config, 'plan_started'), false);

assert.strictEqual(
  sessionPath(sessionDir, path.join(sessionDir, '03-implement', '01-a', 'commit-log.md')),
  '03-implement/01-a/commit-log.md'
);

// backfillHistory: built from stored timestamps only, sorted, all flagged.
const legacy = {
  session_id: 'old',
  created_at: '2026-09-20T08:00:00.000Z',
  usage: {
    grill: { startedAt: '2026-09-20T08:00:00.000Z', sessionIds: [] },
    plan: { startedAt: '2026-09-20T09:00:00.000Z', sessionIds: [] },
    '03-02-persist': { startedAt: '2026-09-20T11:00:00.000Z', sessionIds: [] },
    '03-01-toggle': { startedAt: '2026-09-20T10:00:00.000Z', sessionIds: [] },
  },
  finished_at: '2026-09-20T12:00:00.000Z',
};
const backfilled = backfillHistory(legacy);
assert.deepStrictEqual(
  backfilled.map((e) => [e.at, e.event, e.phase, e.detail && e.detail.ticket]),
  [
    ['2026-09-20T08:00:00.000Z', 'session_started', 'grill', undefined],
    ['2026-09-20T09:00:00.000Z', 'plan_started', 'plan', undefined],
    ['2026-09-20T10:00:00.000Z', 'ticket_started', 'ship', '01-toggle'],
    ['2026-09-20T11:00:00.000Z', 'ticket_started', 'ship', '02-persist'],
    ['2026-09-20T12:00:00.000Z', 'session_finished', 'finished', undefined],
  ]
);
assert.ok(backfilled.every((e) => e.backfilled === true));
assert.deepStrictEqual(backfilled[2].files, ['03-implement/01-toggle/commit-log.md']);
assert.deepStrictEqual(backfillHistory({ created_at: '2026-09-20T08:00:00.000Z' }).map((e) => e.event), ['session_started']);
assert.deepStrictEqual(backfillHistory({}), []);
assert.deepStrictEqual(getHistory(legacy), backfilled);
assert.strictEqual(legacy.history, undefined, 'getHistory does not mutate');
assert.strictEqual(hasEvent(legacy, 'ticket_started', { ticket: '01-toggle' }), true);

// Recording on a session without history: backfill first, and the backfilled
// event of the same kind is replaced by the real one (no duplicate).
const legacyDir = path.join(tmp, 'legacy');
fs.mkdirSync(path.join(legacyDir, '01-grill'), { recursive: true });
fs.writeFileSync(path.join(legacyDir, '01-grill', 'resume.md'), '# S\n\nApproved.\n');
const legacyConfigPath = path.join(legacyDir, '.session-config.json');
const legacyConfig = {
  created_at: '2026-09-20T08:00:00.000Z',
  usage: { plan: { startedAt: '2026-09-20T09:00:00.000Z', sessionIds: [] } },
};
fs.writeFileSync(legacyConfigPath, JSON.stringify(legacyConfig));
recordEvent(legacyConfigPath, legacyConfig, legacyDir, { event: 'plan_started', files: ['02-plan/plan.md'], at: '2026-09-20T09:00:00.000Z' });
const legacySaved = JSON.parse(fs.readFileSync(legacyConfigPath, 'utf-8'));
assert.deepStrictEqual(
  legacySaved.history.map((e) => [e.event, Boolean(e.backfilled)]),
  [['session_started', true], ['plan_started', false]]
);
assert.strictEqual(legacySaved.current_phase, 'plan-not-started');

// A history that is not a list is rebuilt, with a warning.
const warnings = [];
const realError = console.error;
console.error = (message) => warnings.push(String(message));
const broken = { created_at: '2026-09-20T08:00:00.000Z', history: 'oops' };
const rebuilt = ensureHistory(broken);
assert.deepStrictEqual(rebuilt.map((e) => e.event), ['session_started']);
assert.match(warnings.join('\n'), /not a list/);

// recordEvent never throws: an unwritable config path returns false with a warning.
warnings.length = 0;
assert.strictEqual(
  recordEvent(path.join(tmp, 'no-such-dir', 'config.json'), { history: [] }, sessionDir, { event: 'handoff_saved' }),
  false
);
assert.match(warnings.join('\n'), /Session history not recorded/);
console.error = realError;

// renderTimeline: table, local time, links, reconstructed marker, pipe escaping.
const d = new Date('2026-09-25T09:00:00.000Z');
const stamp = `${localDate(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const lines = renderTimeline([
  { at: '2026-09-25T09:00:00.000Z', event: 'session_started', phase: 'grill', files: ['01-grill/resume.md'] },
  {
    at: '2026-09-20T09:00:00.000Z', event: 'ticket_started', phase: 'ship', backfilled: true,
    detail: { ticket: '01-a', note: 'a|b' },
    files: ['02-plan/tickets/01-a.md', '03-implement/01-a/commit-log.md'],
  },
]);
assert.strictEqual(lines[0], '## Timeline');
assert.strictEqual(lines[2], '| When | Phase | Event | Details | Files |');
assert.strictEqual(lines[4], `| ${stamp} | grill | session_started |  | [01-grill/resume.md](01-grill/resume.md) |`);
assert.match(lines[5], /ticket: 01-a, note: a\\\|b, \(reconstructed\)/);
assert.match(lines[5], /\[02-plan\/tickets\/01-a\.md\]\(02-plan\/tickets\/01-a\.md\), \[03-implement\/01-a\/commit-log\.md\]/);
assert.strictEqual(lines[lines.length - 1], '');

fs.rmSync(tmp, { recursive: true, force: true });
console.log('# history.test.js: all assertions passed');
