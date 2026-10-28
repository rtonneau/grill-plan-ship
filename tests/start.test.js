// tests/start.test.js — start.js (/gps start [--issue])
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const h = require('./helpers');
const { initSession } = require('../skills/gps/scripts/lib/session-init');

{
  // Creates the session, its scratch dir, the .scratch/ .gitignore entry and the pointer; .work/ is not ignored.
  const root = h.tempProject();
  const res = h.ok(root, 'start.js', ['feat']);
  assert.match(res.out, /✅ Session started: \d{4}-\d{2}-\d{2}__feat\n/);
  assert.match(res.out, /\nNext: run the grill/);
  const id = h.currentSession(root);
  assert.match(id, /^\d{4}-\d{2}-\d{2}__feat$/);
  assert.ok(fs.existsSync(path.join(root, '.scratch', 'tests', id)));
  const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf-8');
  assert.doesNotMatch(gitignore, /^\.work\/$/m);
  assert.match(gitignore, /^\.scratch\/$/m);
  assert.doesNotMatch(gitignore, /\.current-session|\.pending-seeds|\.write-payload|\.changelog-payload/, 'the state files are committed, not ignored');
  assert.deepStrictEqual(fs.readdirSync(h.sessionDir(root)).sort(), ['.session-config.json', '01-grill']);
  assert.deepStrictEqual(h.history(root).map((e) => [e.event, e.phase]), [['session_started', 'grill']]);
  assert.strictEqual(h.readConfig(root).current_phase, 'grill');
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(root, '.work', 'gps-config.json'), 'utf-8')).github.enabled, false);

  // Re-running the same day resumes the session and never touches it.
  const resume = path.join(h.sessionDir(root), '01-grill', 'resume.md');
  fs.writeFileSync(resume, 'FILLED');
  const before = fs.readFileSync(h.configPath(root), 'utf-8');
  const again = h.ok(root, 'start.js', ['feat']);
  assert.match(again.out, new RegExp(`^↩️ Session ${id} already exists and is not finished\\.\\nPhase: plan-not-started\\n`));
  assert.match(again.out, /\nLast activity: .+ \(idle 0 day\(s\)\)\nCurrent session: yes\n\nNext: \/gps plan — /);
  assert.doesNotMatch(again.out, /Tickets:|\/gps status/);
  assert.strictEqual(again.err, '');
  assert.strictEqual(fs.readFileSync(resume, 'utf-8'), 'FILLED');
  assert.strictEqual(fs.readFileSync(h.configPath(root), 'utf-8'), before);
}

// Every file under the project, with its content: what "writes nothing" compares.
function snapshot(root) {
  const files = {};
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.name === '.git') continue;
      if (entry.isDirectory()) walk(full);
      else files[path.relative(root, full)] = fs.readFileSync(full, 'utf-8');
    }
  };
  walk(root);
  return files;
}

const daysAgo = (n) => new Date(Date.now() - n * 86400000);

{
  // Resuming writes nothing: no dir, no history event, no pointer change, no seed consumed, no .gitignore edit.
  const root = h.tempProject();
  h.ok(root, 'start.js', ['feat']);
  const id = h.currentSession(root);
  h.ok(root, 'start.js', ['other']);
  fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules/\n');
  fs.writeFileSync(path.join(h.sessionsDir(root), '.pending-seeds.json'),
    JSON.stringify({ feat: { strength: 'Strong', problem: 'p', solution: 's' } }));
  const before = snapshot(root);
  const data = h.json(root, 'start.js', ['Feat']);
  assert.deepStrictEqual(snapshot(root), before);
  assert.strictEqual(data.resumable, true);
  assert.strictEqual(data.sessionId, id);
  assert.strictEqual(data.phase, 'grill');
  assert.strictEqual(data.kind, 'feature');
  assert.strictEqual(data.isCurrent, false);
  assert.deepStrictEqual(data.suggestedNext.command, '/gps write');
  const text = h.ok(root, 'start.js', ['feat']).out;
  assert.match(text, /\nCurrent session: no\n/);
  assert.deepStrictEqual(snapshot(root), before);
}

{
  // Cross-day: the newest unfinished session of that slug is resumed, with its tickets and idleness.
  const root = h.gitProject('gps-start-resume-');
  initSession(root, 'Feat X', {}, daysAgo(40));
  initSession(root, 'feat-x', {}, daysAgo(10));
  const newest = h.currentSession(root);
  h.writeGrill(root);
  h.writePlan(root, ['a', 'b']);
  h.completeTicket(root, 1, 'a');
  initSession(root, 'feat-x', {}, daysAgo(20));
  initSession(root, 'feat-x-more', {}, daysAgo(1));
  const before = snapshot(root);
  const res = h.ok(root, 'start.js', ['feat x']);
  assert.match(res.out, new RegExp(`^↩️ Session ${newest} already exists`));
  assert.match(res.out, /\nPhase: ship\nTickets: 1\/2 done\nLast activity: .+ \(idle \d+ day\(s\)\)\nCurrent session: no\n\nNext: \/gps ship — Ticket 02 \(b\) is next/);
  const data = h.json(root, 'start.js', ['feat-x']);
  assert.strictEqual(data.sessionId, newest);
  assert.deepStrictEqual(data.tickets, { done: 1, total: 2 });
  assert.deepStrictEqual(snapshot(root), before);
}

{
  // A finished session with today's id still refuses, pointing at another name rather than /gps status.
  const root = h.tempProject();
  h.ok(root, 'start.js', ['done']);
  h.writeGrill(root);
  h.ok(root, 'finish.js');
  const res = h.run(root, 'start.js', ['done']);
  h.assertFails(res, 1, /Session \d{4}-\d{2}-\d{2}__done already exists; nothing was changed/);
  assert.match(res.err, /Pick a different feature name/);
  assert.doesNotMatch(res.err, /\/gps status/);
  assert.ok(!fs.existsSync(path.join(h.sessionsDir(root), '.current-session')));

  // Finished on another day: today's session is created next to it.
  const other = h.tempProject();
  initSession(other, 'old', {}, daysAgo(5));
  const oldId = h.currentSession(other);
  h.writeGrill(other);
  h.ok(other, 'finish.js');
  const data = h.json(other, 'start.js', ['old']);
  assert.strictEqual(data.resumable, false);
  assert.notStrictEqual(data.sessionId, oldId);
  assert.match(data.sessionId, /__old$/);
  assert.strictEqual(h.currentSession(other), data.sessionId);
}

{
  // A kind mismatch resumes the session as it is, with a warning.
  const root = h.tempProject();
  h.ok(root, 'start.js', ['feat']);
  h.ok(root, 'start.js', ['--issue', 'Crash']);
  const before = snapshot(root);
  const asIssue = h.ok(root, 'start.js', ['--issue', 'feat']);
  assert.match(asIssue.err, /⚠️ {2}--issue was given, but session \S+__feat is a feature session; its kind is kept\./);
  assert.match(asIssue.out, /^↩️ Session \S+__feat already exists/);
  const asFeature = h.run(root, 'start.js', ['crash', '--json']);
  assert.strictEqual(asFeature.code, 0);
  assert.match(asFeature.err, /⚠️ {2}Session \S+__crash is an issue session \(no --issue given\); its kind is kept\./);
  assert.strictEqual(JSON.parse(asFeature.out).kind, 'issue');
  assert.doesNotMatch(h.ok(root, 'start.js', ['--issue', 'crash']).err, /kind is kept/);
  assert.deepStrictEqual(snapshot(root), before);
}

{
  // Names are cleaned to slugs that stay inside .work/sessions.
  const root = h.tempProject();
  const target = `escaped-${process.pid}-${Date.now()}`;
  const res = h.ok(root, 'start.js', [`x/../../../../${target}`]);
  assert.match(res.out, new RegExp(`cleaned to "x-${target}"`));
  assert.ok(fs.existsSync(path.join(h.sessionDir(root), '.session-config.json')));
  assert.ok(!fs.existsSync(path.join(root, '..', target)));
  h.ok(root, 'start.js', ['a:b?c']);
  assert.match(h.currentSession(root), /__a-b-c$/);
  h.ok(root, 'start.js', ['!!!']);
  assert.match(h.currentSession(root), /__untitled-\d{6}$/);
  // Words are joined, so an unquoted name works.
  h.ok(root, 'start.js', ['Add', 'Dark', 'Mode']);
  assert.match(h.currentSession(root), /__add-dark-mode$/);
}

{
  // Usage errors: exit 2, nothing created.
  const root = h.tempProject();
  h.assertFails(h.run(root, 'start.js'), 2, /Usage: start\.js/);
  h.assertFails(h.run(root, 'start.js', ['   ']), 2, /Missing feature name/);
  h.assertFails(h.run(root, 'start.js', ['x', '--bogus']), 2, /Unknown option: --bogus/);
  assert.ok(!fs.existsSync(path.join(root, '.work')));
}

{
  // --issue: kind "issue"; local (with a warning) when GitHub is off.
  const root = h.tempProject();
  const res = h.ok(root, 'start.js', ['--issue', 'Crash', 'on', 'save']);
  assert.match(res.out, /\(issue\)/);
  assert.match(res.err, /⚠️ {2}GitHub is not enabled for this project/);
  const config = h.readConfig(root);
  assert.strictEqual(config.kind, 'issue');
  assert.strictEqual(config.feature_name, 'Crash on save');
  assert.deepStrictEqual(config.history.map((e) => [e.event, e.detail]), [['session_started', { kind: 'issue' }]]);
}

{
  // A matching scout seed is printed and consumed; --json carries the data.
  const root = h.tempProject();
  fs.mkdirSync(h.sessionsDir(root), { recursive: true });
  const seeds = path.join(h.sessionsDir(root), '.pending-seeds.json');
  fs.writeFileSync(seeds, JSON.stringify({
    'safe-linking': { strength: 'Strong', severity: 'Critical', problem: 'C1: p', solution: 's', sourceReport: 'scout-reports/r.md' },
    other: { strength: 'Speculative', problem: 'p', solution: 's' },
  }));
  const res = h.ok(root, 'start.js', ['safe-linking']);
  assert.match(res.out, /Scout seed for "safe-linking" \(from scout-reports\/r\.md\)/);
  assert.match(res.out, /"severity": "Critical"/);
  assert.deepStrictEqual(Object.keys(JSON.parse(fs.readFileSync(seeds, 'utf-8'))), ['other']);

  const data = h.json(root, 'start.js', ['brand new']);
  assert.strictEqual(data.seed, null);
  assert.strictEqual(data.kind, 'feature');
  assert.match(data.sessionId, /__brand-new$/);
}

{
  // A .work/ that an older gps git-ignored: start warns that nothing will be committed.
  const root = h.gitProject();
  fs.writeFileSync(path.join(root, '.gitignore'), '.work/\n');
  const res = h.ok(root, 'start.js', ['feat']);
  assert.match(res.err, /\.work\/ is git-ignored, so gps commits none of its session files/);
  const clean = h.gitProject();
  assert.doesNotMatch(h.ok(clean, 'start.js', ['feat']).err, /git-ignored/);
}

{
  // In a git repo whose gps setup is not committed, start suggests /gps init; once it is, it doesn't.
  const root = h.gitProject();
  assert.match(h.ok(root, 'start.js', ['one']).out, /Tip: \/gps init \(once per project\)/);
  h.ok(root, 'init.js', ['--apply']);
  assert.doesNotMatch(h.ok(root, 'start.js', ['two']).out, /Tip: \/gps init/);
  // Outside git there is nothing to commit, so no tip.
  assert.doesNotMatch(h.ok(h.tempProject(), 'start.js', ['three']).out, /Tip: \/gps init/);
}

h.done('start.test.js');
