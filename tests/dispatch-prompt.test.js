// tests/dispatch-prompt.test.js — dispatch-prompt.js (/gps ship: the child's spawn call)
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const h = require('./helpers');

const root = h.gitProject();
h.shipReady(root, 'dispatch', [{ slug: 'toggle', model: 'fast' }, { slug: 'docs' }]);

// Usage errors.
h.assertFails(h.run(root, 'dispatch-prompt.js', []), 2);
h.assertFails(h.run(root, 'dispatch-prompt.js', ['1', '--model', 'gpt-9']), 2, /--model must be one of: fast, medium, heavy, inherit/);
h.assertFails(h.run(root, 'dispatch-prompt.js', ['1', '--host', 'unknown']), 2, /--host/);
h.assertFails(h.run(root, 'dispatch-prompt.js', ['1', '--mode', 'subagent']), 2, /Unknown option/i);

// Needs ticket-start.js first.
h.assertFails(h.run(root, 'dispatch-prompt.js', ['1']), 1, /no workspace yet[\s\S]*ticket-start\.js 1/);
h.ok(root, 'ticket-start.js', ['1']);

// Role dispatch must be read-only and bind review to an immutable, real base.
const base = h.git(root, 'rev-parse', 'HEAD');
const stateBeforeRoles = fs.readFileSync(h.configPath(root), 'utf-8');
const statusBeforeRoles = h.git(root, 'status', '--porcelain');
h.assertFails(h.run(root, 'dispatch-prompt.js', ['1', '--role', 'researcher']), 2, /--role/);
h.assertFails(h.run(root, 'dispatch-prompt.js', ['1', '--role', 'reviewer']), 2, /--base/);
h.assertFails(h.run(root, 'dispatch-prompt.js', ['1', '--role', 'reviewer', '--base', 'HEAD']), 2, /full commit/);
h.assertFails(h.run(root, 'dispatch-prompt.js', ['1', '--role', 'reviewer', '--base', '0'.repeat(40)]), 1, /base.*commit/i);
h.assertFails(h.run(root, 'dispatch-prompt.js', ['1', '--base', base]), 2, /reviewer/);
const reviewArgs = ['1', '--role', 'reviewer', '--base', base];
const reviewer = h.json(root, 'dispatch-prompt.js', reviewArgs);
const codexReviewer = h.json(root, 'dispatch-prompt.js', [...reviewArgs, '--host', 'codex']);
assert.strictEqual(reviewer.role, 'reviewer');
assert.strictEqual(reviewer.call.subagent_type, 'grill-plan-ship:gps-reviewer', 'Claude reviewers run as the read-only agent');
assert.match(reviewer.lifecycle, /general-purpose with the same prompt/, 'the parent falls back when the plugin agent is unavailable');
assert.strictEqual(reviewer.base, base);
assert.strictEqual(reviewer.call.prompt, codexReviewer.call.message, 'both hosts consume the same reviewer brief');
assert.strictEqual(codexReviewer.call.task_name, 'gps_review_01');
assert.strictEqual(codexReviewer.call.fork_turns, 'none');
assert.match(reviewer.call.prompt, new RegExp(`git diff ${base} --`));
assert.match(reviewer.call.prompt, /untracked/);
assert.match(reviewer.call.prompt, /Do not edit any files/);
assert.match(reviewer.call.prompt, /Do not commit, stage, change session state/);
assert.match(reviewer.call.prompt, /file:line.*severity/);
assert.match(reviewer.call.prompt, /Verification gaps/);
assert.match(reviewer.call.prompt, /REVIEWED — findings/);
assert.match(reviewer.call.prompt, /REVIEWED — no findings/);
assert.doesNotMatch(reviewer.call.prompt, /End with.*READY/);
assert.strictEqual(fs.readFileSync(h.configPath(root), 'utf-8'), stateBeforeRoles);
assert.strictEqual(h.git(root, 'status', '--porcelain'), statusBeforeRoles);
assert.strictEqual(h.git(root, 'rev-parse', 'HEAD'), base);

// The brief: every path filled in, the parent owns git, one final line.
let data = h.json(root, 'dispatch-prompt.js', ['1']);
assert.strictEqual(data.model, 'fast');
assert.strictEqual(data.call.subagent_type, 'grill-plan-ship:gps-implementer');
assert.strictEqual(data.call.model, 'haiku');
assert.strictEqual(data.call.description, 'gps ticket 01 toggle');
const prompt = data.call.prompt;
assert.strictEqual(data.role, 'implementer');
assert.strictEqual(h.json(root, 'dispatch-prompt.js', ['1', '--role', 'implementer']).call.prompt, prompt);
assert.match(prompt, /Repository: /);
assert.match(prompt, /AGENTS\.md.*CLAUDE\.md/);
assert.match(prompt, /Do not commit, stage, change session state/);
assert.match(prompt, /parent's recorded findings/);
assert.ok(prompt.includes(path.join(h.sessionDir(root), '02-plan', 'tickets', '01-toggle.md')), 'spec path');
assert.ok(prompt.includes(path.join(h.sessionDir(root), '03-implement', '01-toggle', 'commit-log.md')), 'log path');
assert.ok(prompt.includes(`.scratch/tests/${h.currentSession(root)}`), 'scratch dir');
assert.match(prompt, /only writer in this tree/);
assert.match(prompt, /leave your changes unstaged and uncommitted/i);
assert.match(prompt, /permission or sandbox denial, stop and report BLOCKED/);
assert.match(prompt, /never retry it through another shell, tool or agent/);
assert.match(prompt, /`READY — <files you changed, comma-separated> — <verification result>` or `BLOCKED — <cause, and what you tried>`/);
assert.doesNotMatch(prompt, /ticket-complete\.js"/, 'the child runs no ticket script');

// --model overrides; inherit leaves the model out of the call.
assert.strictEqual(h.json(root, 'dispatch-prompt.js', ['1', '--model', 'heavy']).call.model, 'opus');
data = h.json(root, 'dispatch-prompt.js', ['1', '--model', 'inherit']);
assert.strictEqual(data.model, 'inherit');
assert.ok(!('model' in data.call));

// Text mode shows the call.
assert.match(h.ok(root, 'dispatch-prompt.js', ['1']).out, /^Agent tool call for ticket 01 \(toggle\), model fast, effort inherit:/);

// Codex: the same brief; the tier stays a note for the parent unless the project pinned a model.
const configPath = path.join(root, '.work', 'gps-config.json');
const before = fs.readFileSync(configPath, 'utf-8');
let codex = h.json(root, 'dispatch-prompt.js', ['1', '--host', 'codex']);
assert.strictEqual(codex.host, 'codex');
assert.strictEqual(codex.call.message, prompt);
assert.strictEqual(codex.call.fork_turns, 'none');
assert.strictEqual(codex.call.task_name, 'gps_ticket_01');
assert.ok(!('model' in codex.call), 'no invented model ID');
assert.ok(!('subagent_type' in codex.call));
assert.match(codex.notes[0], /most efficient model offered by your spawn tool/);
assert.match(h.ok(root, 'dispatch-prompt.js', ['1', '--host', 'codex']).out, /Codex spawn_agent tool call[\s\S]*- Note: Set model/);
assert.strictEqual(fs.readFileSync(configPath, 'utf-8'), before, 'dispatch changes nothing');
fs.writeFileSync(configPath, JSON.stringify({ ...JSON.parse(before), delegation: { codex: { models: { fast: { model: 'available-model', efforts: ['low'] } } } } }));
codex = h.json(root, 'dispatch-prompt.js', ['1', '--host', 'codex', '--effort', 'low']);
assert.strictEqual(codex.call.model, 'available-model');
assert.strictEqual(codex.call.reasoning_effort, 'low');
h.assertFails(h.run(root, 'dispatch-prompt.js', ['1', '--host', 'codex', '--effort', 'high']), 1, /required.*high|high.*required/i);
const inherited = h.json(root, 'dispatch-prompt.js', ['1', '--host', 'codex', '--model', 'inherit', '--effort', 'inherit']);
assert.ok(!('model' in inherited.call) && !('reasoning_effort' in inherited.call));
assert.deepStrictEqual(inherited.notes, []);

// A Done ticket is refused.
h.completeTicket(root, 1, 'toggle');
h.assertFails(h.run(root, 'dispatch-prompt.js', ['1']), 1, /already Done/);

// Effort: passed on the call; max is refused with the reason (decision 0001).
{
  const r = h.gitProject();
  h.shipReady(r, 'effort', [{ slug: 'a', model: 'medium', effort: 'xhigh' }]);
  h.ok(r, 'ticket-start.js', ['1']);
  let d = h.json(r, 'dispatch-prompt.js', ['1']);
  assert.strictEqual(d.effort, 'xhigh');
  assert.strictEqual(d.call.effort, 'xhigh');
  assert.strictEqual(d.call.model, 'sonnet');
  assert.strictEqual(h.json(r, 'dispatch-prompt.js', ['1', '--effort', 'low']).call.effort, 'low');
  d = h.json(r, 'dispatch-prompt.js', ['1', '--effort', 'inherit']);
  assert.ok(!('effort' in d.call));
  h.assertFails(h.run(r, 'dispatch-prompt.js', ['1', '--effort', 'turbo']), 2, /--effort must be one of: low, medium, high, xhigh, inherit\./);
  h.assertFails(h.run(r, 'dispatch-prompt.js', ['1', '--effort', 'max']), 2, /--effort must be one of: .* \(gps effort hints stop at xhigh/);
}

// Branch reviewer (/gps finish --review): the whole session from a full base, no ticket.
{
  const sessionBase = h.git(root, 'rev-parse', 'HEAD');
  h.assertFails(h.run(root, 'dispatch-prompt.js', ['--role', 'branch-reviewer']), 2, /--base must be a full commit SHA for branch-reviewer/);
  h.assertFails(h.run(root, 'dispatch-prompt.js', ['1', '--role', 'branch-reviewer', '--base', sessionBase]), 2, /takes no ticket number/);
  h.assertFails(h.run(root, 'dispatch-prompt.js', ['--role', 'reviewer', '--base', sessionBase]), 2, /needs a ticket number/);
  h.assertFails(h.run(root, 'dispatch-prompt.js', []), 2, /needs a ticket number/);
  const state = fs.readFileSync(h.configPath(root), 'utf-8');
  const branch = h.json(root, 'dispatch-prompt.js', ['--role', 'branch-reviewer', '--base', sessionBase]);
  const codexBranch = h.json(root, 'dispatch-prompt.js', ['--role', 'branch-reviewer', '--base', sessionBase, '--host', 'codex']);
  assert.strictEqual(branch.call.subagent_type, 'grill-plan-ship:gps-branch-reviewer');
  assert.strictEqual(branch.call.prompt, codexBranch.call.message, 'both hosts read the same branch brief');
  assert.strictEqual(codexBranch.call.task_name, 'gps_branch_review');
  assert.ok(branch.session && !('ticket' in branch));
  const brief = branch.call.prompt;
  assert.match(brief, /^# GPS branch-reviewer: session /);
  assert.ok(brief.includes(path.join(h.sessionDir(root), '01-grill', 'resume.md')), 'resume path');
  assert.ok(brief.includes(path.join(h.sessionDir(root), '02-plan', 'plan.md')), 'plan path');
  assert.match(brief, new RegExp(`git diff ${sessionBase} --`));
  assert.match(brief, /Do not commit, stage, change session state/);
  assert.match(brief, /Do not edit any files/);
  assert.match(brief, /REVIEWED — no findings/);
  assert.doesNotMatch(brief, /\{\{/, 'every slot filled');
  assert.strictEqual(fs.readFileSync(h.configPath(root), 'utf-8'), state, 'read-only');
}

// Plan checker (/gps plan): reads the drafted payload before write-apply.js saves it.
{
  const r = h.gitProject();
  h.ok(r, 'start.js', ['checked']);
  h.writeGrill(r);
  h.ok(r, 'plan.js');
  h.assertFails(h.run(r, 'dispatch-prompt.js', ['--role', 'plan-checker']), 1, /No drafted plan to check[\s\S]*write-prepare\.js/);
  h.assertFails(h.run(r, 'dispatch-prompt.js', ['1', '--role', 'plan-checker']), 2, /takes no ticket number/);
  h.assertFails(h.run(r, 'dispatch-prompt.js', ['--role', 'plan-checker', '--base', h.git(r, 'rev-parse', 'HEAD')]), 2, /--base is only used/);
  const prep = h.json(r, 'write-prepare.js');
  fs.writeFileSync(prep.payloadPath, h.planPayload(prep, [{ slug: 'one' }, { slug: 'two' }]));
  const before = fs.readFileSync(prep.payloadPath, 'utf-8');
  const check = h.json(r, 'dispatch-prompt.js', ['--role', 'plan-checker']);
  const codexCheck = h.json(r, 'dispatch-prompt.js', ['--role', 'plan-checker', '--host', 'codex']);
  assert.strictEqual(check.call.subagent_type, 'grill-plan-ship:gps-plan-checker');
  assert.strictEqual(check.call.prompt, codexCheck.call.message, 'both hosts read the same plan-check brief');
  assert.strictEqual(codexCheck.call.task_name, 'gps_plan_check');
  assert.ok(check.call.prompt.includes(`- Plan draft: ${prep.payloadPath}`), 'points at the payload');
  assert.ok(check.call.prompt.includes(path.join(h.sessionDir(r), '01-grill', 'resume.md')), 'points at the resume');
  assert.match(check.call.prompt, /Verification Steps/);
  assert.match(check.call.prompt, /CHECKED — no findings/);
  assert.doesNotMatch(check.call.prompt, /\{\{/, 'every slot filled');
  assert.strictEqual(fs.readFileSync(prep.payloadPath, 'utf-8'), before, 'the draft is left as written');
  assert.strictEqual(h.json(r, 'write-prepare.js').target, 'plan', 'the plan is still pending');
}

// Scout explorer (/gps scout): one area, no session needed.
{
  const r = h.tempProject();
  assert.ok(!fs.existsSync(path.join(r, '.work', 'sessions')), 'no session exists');
  h.assertFails(h.run(r, 'dispatch-prompt.js', ['--role', 'scout']), 2, /needs --area/);
  h.assertFails(h.run(r, 'dispatch-prompt.js', ['1', '--role', 'scout', '--area', 'x']), 2, /takes no ticket number/);
  h.assertFails(h.run(root, 'dispatch-prompt.js', ['1', '--area', 'x']), 2, /only used by the scout role/);
  h.assertFails(h.run(root, 'dispatch-prompt.js', ['1', '--direction', 'x']), 2, /only used by the scout role/);
  const scout = h.json(r, 'dispatch-prompt.js', ['--role', 'scout', '--area', 'Session store', '--direction', 'fewer files']);
  const codexScout = h.json(r, 'dispatch-prompt.js', ['--role', 'scout', '--area', 'Session store', '--direction', 'fewer files', '--host', 'codex']);
  assert.strictEqual(scout.area, 'Session store');
  assert.strictEqual(scout.call.subagent_type, 'grill-plan-ship:gps-scout');
  assert.strictEqual(scout.call.prompt, codexScout.call.message, 'both hosts read the same scout brief');
  assert.strictEqual(codexScout.call.task_name, 'gps_scout_session_store', 'one task name per area');
  assert.match(scout.call.prompt, /^# GPS scout: area Session store/);
  assert.match(scout.call.prompt, /Direction: fewer files/);
  assert.match(scout.call.prompt, /you write none/);
  assert.match(scout.call.prompt, /SCOUTED — no candidates/);
  assert.doesNotMatch(scout.call.prompt, /\{\{/, 'every slot filled');
  assert.match(h.json(r, 'dispatch-prompt.js', ['--role', 'scout', '--area', 'cli']).call.prompt, /Direction: none given/);
  assert.ok(!fs.existsSync(path.join(r, '.work', 'sessions')), 'read-only: still no session');
}

h.done('dispatch-prompt.test.js');
