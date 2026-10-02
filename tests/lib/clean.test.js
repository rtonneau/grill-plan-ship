// tests/lib/clean.test.js — listing, the deletion plan and its rendering
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  listCleanable, listIdeas, planDeletion, applyDeletion, renderList, renderPlan,
} = require('../../skills/gps/scripts/lib/clean');

const sessionsDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gps-libclean-')), '.work', 'sessions');
const now = new Date('2026-10-02T12:00:00.000Z');
const daysAgo = (n) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
function addSession(id, days, extra = {}) {
  fs.mkdirSync(path.join(sessionsDir, id, '01-grill'), { recursive: true });
  fs.writeFileSync(path.join(sessionsDir, id, '.session-config.json'),
    JSON.stringify({ feature_name: id, created_at: daysAgo(days), ...extra }));
}
addSession('done', 30, { finished_at: daysAgo(29) });
addSession('wip', 3, { git: { branch: 'feat/wip', pr_url: 'https://x/pull/1' }, issue: { url: 'https://x/issues/2' } });
fs.mkdirSync(path.join(sessionsDir, 'wip', '03-implement', '01-a'), { recursive: true });
fs.writeFileSync(path.join(sessionsDir, '.current-session'), 'done');
fs.writeFileSync(path.join(sessionsDir, '.pending-seeds.json'), JSON.stringify({
  old: { problem: 'Old | idea', createdAt: daysAgo(9) }, fresh: { problem: 'New', createdAt: daysAgo(1) },
}));

const sessions = listCleanable(sessionsDir, now);
assert.deepStrictEqual(sessions.map((s) => [s.sessionId, s.idleDays, s.finished, s.current, s.ticketsStarted]),
  [['done', 29, true, true, 0], ['wip', 3, false, false, 1]]);
const { ideas, problem } = listIdeas(sessionsDir, now);
assert.deepStrictEqual(ideas.map((i) => [i.slug, i.idleDays]), [['old', 9], ['fresh', 1]]);
assert.strictEqual(problem, null);

// The list text escapes table cells; 29 idle days is very-stale (28+).
const text = renderList(sessions, ideas, null);
assert.match(text, /\| done \| done \| finished \| 29 \| current \(not deletable\), very-stale \|/);
assert.match(text, /\| wip \| wip \| unfinished \| 3 \| 1 ticket\(s\) started, branch feat\/wip, PR, issue \|/);
assert.match(text, /\| old \|  \| 9 \| Old \\\| idea \|/);
assert.match(renderList([], [], 'bad json'), /ideas file is unreadable \(bad json\)/);

// The plan: validated, with one warning per thing the deletion loses.
assert.throws(() => planDeletion(sessionsDir, ['done']), /is the current session/);
assert.throws(() => planDeletion(sessionsDir, ['nope']), /neither a session nor a scouted idea/);
const plan = planDeletion(sessionsDir, ['wip', 'old', 'wip']);
assert.deepStrictEqual(plan.sessions.map((s) => s.sessionId), ['wip']);
assert.deepStrictEqual(plan.ideas, [{ slug: 'old', problem: 'Old | idea' }]);
assert.deepStrictEqual(plan.warnings, [
  'wip is not finished.',
  'wip has 1 ticket(s) started.',
  'wip has branch feat/wip, PR https://x/pull/1, issue https://x/issues/2: kept, only the local session folder goes.',
]);
const planText = renderPlan(plan);
assert.match(planText, /- session wip \(wip\): unfinished, idle \d+ days/);
assert.match(planText, /- idea old: Old \| idea/);
assert.match(planText, /⚠️ wip is not finished\./);

// Nothing is removed until applyDeletion.
assert.ok(fs.existsSync(path.join(sessionsDir, 'wip')));
applyDeletion(sessionsDir, plan);
assert.ok(!fs.existsSync(path.join(sessionsDir, 'wip')));
assert.deepStrictEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(sessionsDir, '.pending-seeds.json'), 'utf-8'))), ['fresh']);

fs.rmSync(path.dirname(path.dirname(sessionsDir)), { recursive: true, force: true });
console.log('clean.test.js (lib): all assertions passed');
