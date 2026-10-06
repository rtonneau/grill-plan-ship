// tests/e2e.test.js
//
// One full session through the real scripts, in a throwaway git repo, the
// way the references drive them:
//   start -> write (grill) -> plan -> write (plan) -> ship 2 tickets
//   (ticket-start -> dispatch-prompt -> ticket-complete -> ticket-check)
//   -> handoff -> status -> finish -> scout --from -> start (seeded).
// After every step /gps status reports the right phase and next command,
// the recorded phase never drifts, and the history lists every step.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const h = require('./helpers');

const root = h.gitProject('gps-e2e-');

function expectStatus(phase, command) {
  const report = h.json(root, 'status.js');
  assert.strictEqual(report.current.phase, phase);
  assert.ok(report.sessions.every((s) => s.phaseDrift === null), 'the recorded phase drifted from the derived phase');
  assert.strictEqual(report.current.suggestedNext.command, command);
  return report;
}

// start
h.ok(root, 'start.js', ['Add Dark Mode']);
const sessionDir = h.sessionDir(root);
assert.match(h.currentSession(root), /^\d{4}-\d{2}-\d{2}__add-dark-mode$/);
expectStatus('grill', '/gps write');

// write (grill): the skeleton, filled, is the payload
let prep = h.json(root, 'write-prepare.js');
fs.writeFileSync(prep.payloadPath, h.fillSkeleton(prep.skeleton, 'Approved.'));
h.ok(root, 'write-apply.js');
expectStatus('plan-not-started', '/gps plan');

// plan
h.ok(root, 'plan.js');
expectStatus('plan', '/gps write');

// write (plan): two tickets from the skeleton's ticket block
prep = h.json(root, 'write-prepare.js');
const head = prep.skeleton.slice(0, prep.skeleton.indexOf('--- ticket:'));
const block = prep.skeleton.slice(prep.skeleton.indexOf('--- ticket:'));
const ticket = (slug, model, effort) => h.fillSkeleton(block.replace('01-<slug>', slug), 'Done.')
  .replace('**Model:** Done.', model ? `**Model:** ${model}` : '')
  .replace('**Effort:** Done.', effort ? `**Effort:** ${effort}` : '');
fs.writeFileSync(prep.payloadPath, `${h.fillSkeleton(head, '1 day')}${ticket('01-toggle', 'haiku', 'high')}\n${ticket('02-persist')}`);
h.ok(root, 'write-apply.js');
let report = expectStatus('ship', '/gps ship');
assert.strictEqual(report.current.nextPending.slug, 'toggle');
assert.match(h.ok(root, 'ticket-queue.js').out, /1: haiku\/high\n2: inherit\/inherit/);

// ship: ticket 1 the subagent way, ticket 2 inline
for (const [num, slug, mode] of [[1, 'toggle', 'subagent'], [2, 'persist', 'inline']]) {
  const started = h.json(root, 'ticket-start.js');
  assert.strictEqual(started.ticket.slug, slug);
  if (mode === 'subagent') {
    const call = h.json(root, 'dispatch-prompt.js', [String(num), '--mode', 'subagent']).call;
    assert.strictEqual(call.model, 'haiku');
    assert.strictEqual(call.subagent_type, 'grill-plan-ship:gps-ticket-high');
    assert.ok(call.prompt.includes(started.ticket.commitLogPath));
  }
  h.fillLog(root, `0${num}-${slug}`);
  fs.writeFileSync(path.join(root, `${slug}.js`), `// ${slug}\n`);
  h.ok(root, 'ticket-complete.js', [String(num), '--message', `feat: ${slug}`, '--file', `${slug}.js`]);
  h.ok(root, 'ticket-check.js', [String(num)]);
}
assert.match(h.ok(root, 'ticket-start.js').out, /All tickets are done/);
report = expectStatus('finish-pending', '/gps finish');
assert.ok(report.current.gitLog.some((line) => line.includes('feat: persist')));

// handoff, then status shows it without drift
fs.writeFileSync(path.join(root, 'wip.js'), '// uncommitted\n');
assert.ok(h.json(root, 'handoff.js').gitStatus.project.some((e) => e.path === 'wip.js'));
report = expectStatus('finish-pending', '/gps finish');
assert.strictEqual(report.current.handoff.drift, null);
fs.rmSync(path.join(root, 'wip.js'));

// changelog: drafted bullets and the bump, before finish
const clPrep = h.json(root, 'changelog-prepare.js');
fs.writeFileSync(clPrep.payloadPath, '- Dark mode toggle, remembered between visits\n');
h.ok(root, 'changelog-apply.js', ['--bump', clPrep.floor]);

// finish
const finish = h.json(root, 'finish.js');
assert.deepStrictEqual(finish.unfinished, []);
const index = fs.readFileSync(path.join(sessionDir, 'INDEX.md'), 'utf-8');
assert.match(index, /✅ 01 toggle/);
assert.match(index, /✅ 02 persist/);
for (const [, link] of index.matchAll(/\]\(([^)]+)\)/g)) {
  assert.ok(fs.existsSync(path.join(sessionDir, link)), `INDEX.md links to a missing file: ${link}`);
}
assert.ok(!fs.existsSync(path.join(h.sessionsDir(root), '.current-session')));

// history: every step, in order, with the phase after it
const config = JSON.parse(fs.readFileSync(path.join(sessionDir, '.session-config.json'), 'utf-8'));
assert.deepStrictEqual(config.history.map((e) => [e.event, e.phase]), [
  ['session_started', 'grill'], ['grill_written', 'plan-not-started'], ['plan_started', 'plan'], ['plan_written', 'ship'],
  ['ticket_started', 'ship'], ['ticket_done', 'ship'], ['ticket_started', 'ship'], ['ticket_done', 'finish-pending'],
  ['handoff_saved', 'finish-pending'], ['changelog_written', 'finish-pending'], ['session_finished', 'finished'],
]);
const stamps = config.history.map((e) => e.at);
assert.deepStrictEqual(stamps, [...stamps].sort(), 'events are in chronological order');
assert.ok(config.history.every((e) => !e.backfilled));
const after = h.json(root, 'status.js');
assert.strictEqual(after.current, null);
assert.strictEqual(after.sessions[0].phase, 'finished');

// changelog and release: the entry was written before finish; release cuts the version
{
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }, null, 2) + '\n');
  h.git(root, 'add', '-A');
  h.git(root, 'commit', '-q', '-m', 'chore: setup');
  assert.ok(!fs.existsSync(path.join(root, 'CHANGELOG.md')), 'finish leaves CHANGELOG.md to the release');
  assert.strictEqual(fs.readdirSync(path.join(root, '.work', 'changelog')).length, 1, 'one fragment per session');
  const sug = h.json(root, 'release.js');
  assert.strictEqual(sug.current, '1.0.0');
  assert.strictEqual(sug.sessions, 1);
  h.ok(root, 'release.js', ['--version', sug.suggested]);
  const log = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf-8');
  const escaped = sug.suggested.replace(/\./g, '\\.');
  assert.match(log, new RegExp(`^## ${escaped} \\(${today}\\)$`, 'm'));
  assert.ok(!log.includes('<!--'), 'no gps marker is left in the CHANGELOG');
  assert.ok(!log.includes('Unreleased'));
  assert.ok(log.includes('- Dark mode toggle, remembered between visits\n'));
  assert.deepStrictEqual(fs.readdirSync(path.join(root, '.work', 'changelog')), [], 'the release deletes the fragment');
  assert.ok(h.git(root, 'tag', '-l').split('\n').includes(`v${sug.suggested}`), 'the version is tagged');
}

// scout --from -> start: the seed is consumed and printed
fs.mkdirSync(path.join(root, 'docs'));
fs.writeFileSync(path.join(root, 'docs', 'review.md'), '# Review\n\nC1: links delete config.\n');
const entries = path.join(root, 'scout-entries.json');
fs.writeFileSync(entries, JSON.stringify({
  sourceDirection: null,
  candidates: [{ slug: 'safe-linking', strength: 'Strong', severity: 'Critical', problem: 'C1: p', solution: 's' }],
}));
h.ok(root, 'scout-merge.js', ['--from', 'docs/review.md', entries]);
const seeded = h.ok(root, 'start.js', ['safe-linking']).out;
assert.match(seeded, /"severity": "Critical"/);
assert.match(seeded, /"sourcePath": "docs\/review\.md"/);

fs.rmSync(root, { recursive: true, force: true });
h.done('e2e.test.js');
