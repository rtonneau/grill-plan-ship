# Session history Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every `.session-config.json` a timeline of its session: an append-only `history` of events (time, phase, `.md` files), a recorded `current_phase`, exact ticket-done times via `ticket-done.js`, and a `## Timeline` in `INDEX.md`.

**Architecture:** A `history.js` module owns event recording, backfill of older sessions and timeline rendering. Handlers call `recordEvent` after their files are written; it never throws. `/gps status` keeps deriving the phase from files and reports `phaseDrift` against the recorded one. `ticket-done.js` is the explicit hook for ticket completion.

**Tech Stack:** Node.js >= 20, `fs`/`path` only, no dependencies. Tests are plain `assert` scripts run by `npm test` (`node scripts/run-tests.js`).

**Spec:** `docs/superpowers/specs/2026-09-25-session-history-design.md`

**Order:** This plan is implemented **before** `docs/superpowers/plans/2026-09-25-github-config-issue.md` (which records its branch/issue/PR events through `recordEvent`).

## Global Constraints

- Node >= 20, no external dependencies; `fs`, `path` only.
- Handler output uses `✅` for success, `❌` for errors (via `GpsError` + `runCli`), `⚠️` for warnings; timestamps are `new Date().toISOString()`.
- History failures never fail a command: `recordEvent` catches everything, prints `⚠️  Session history not recorded: <reason>` to stderr and returns false.
- Event `files` are relative to the session directory, forward slashes.
- Phase labels are exactly those of `scripts/lib/phase.js`: `grill`, `plan-not-started`, `plan`, `ship`, `finish-pending`, `plan-complete`, `finished`.
- `/gps status` (`status.js`) and `/gps resume` stay read-only: `e2e.test.js` hashes `.work/` around them, so they must never call `recordEvent`.
- `skills/gps/SKILL.md` and the router test in `scripts/handlers.test.js` are unchanged (`ticket-done.js` is not a `/gps` command).
- The version is already `1.4.0`: do not touch `package.json` or `.claude-plugin/*.json`.
- Every commit message ends with these two lines (blank line before them):
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_013xhs9GDjP55qn7JDAWH7pf
  ```
- Work happens on branch `feat/github-config-issue` (already checked out). Run `npm test` before each commit.

---

### Task 1: `history.js` (record, backfill, render)

**Files:**
- Create: `scripts/lib/history.js`
- Test: `scripts/lib/history.test.js`

**Interfaces:**
- Consumes: `computeSessionState(sessionDir, config)` from `./phase`; `localDate`, `writeJsonAtomic` from `./guard`.
- Produces (all exported from `scripts/lib/history.js`):
  - `recordEvent(configPath, config, sessionDir, { event, files, detail, at }) -> boolean` (never throws).
  - `getHistory(config) -> event[]` (`config.history` if it is an array, else the backfilled view; does not mutate).
  - `backfillHistory(config) -> event[]`.
  - `ensureHistory(config) -> event[]` (creates `config.history` from the backfill when missing or not an array; warns when it was not an array).
  - `hasEvent(config, event, detail = {}) -> boolean` (uses `getHistory`; every key of `detail` must equal the event's `detail[key]`).
  - `sessionPath(sessionDir, absolutePath) -> string` (relative, forward slashes).
  - `renderTimeline(events) -> string[]` (markdown lines of a `## Timeline` table, ending with an empty string).
  - An event is `{ at, event, phase, files?, detail?, backfilled? }`.

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/history.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/lib/history.test.js`
Expected: FAIL with `Cannot find module './history'`.

- [ ] **Step 3: Implement**

Create `scripts/lib/history.js`:

```js
// scripts/lib/history.js
//
// The session's timeline, stored in .session-config.json:
//   history:       append-only list of events { at, event, phase, files?, detail?, backfilled? }
//   current_phase: the phase after the last recorded event
// Files stay the source of truth for the phase (phase.js derives it); the
// recorded phase is a fact about when handlers last ran, and /gps status
// reports drift between the two. `phase` of an event is derived at record
// time with computeSessionState, so it always uses phase.js's vocabulary.
// Event `files` are relative to the session directory, forward slashes.
//
// recordEvent never throws: history must never block a command.

const path = require('path');
const { localDate, writeJsonAtomic } = require('./guard');
const { computeSessionState } = require('./phase');

const TICKET_USAGE_KEY_RE = /^03-(\d+-.+)$/;

// Path of `absolutePath` relative to the session directory, forward slashes.
function sessionPath(sessionDir, absolutePath) {
  return path.relative(sessionDir, absolutePath).split(path.sep).join('/');
}

// Events reconstructed from the facts older sessions stored: created_at,
// usage.*.startedAt, finished_at. Sorted by time, each flagged backfilled.
function backfillHistory(config) {
  const events = [];
  const add = (at, event, phase, extra = {}) => {
    if (at) events.push({ at, event, phase, ...extra, backfilled: true });
  };
  const usage = config.usage || {};

  add(config.created_at, 'session_started', 'grill', { files: ['01-grill/resume.md'] });
  if (usage.plan) add(usage.plan.startedAt, 'plan_started', 'plan', { files: ['02-plan/plan.md'] });
  for (const [key, value] of Object.entries(usage)) {
    const match = key.match(TICKET_USAGE_KEY_RE);
    if (match && value) {
      add(value.startedAt, 'ticket_started', 'ship', {
        files: [`03-implement/${match[1]}/commit-log.md`],
        detail: { ticket: match[1] },
      });
    }
  }
  add(config.finished_at, 'session_finished', 'finished', { files: ['INDEX.md'] });

  return events.sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

// The stored history, or the backfilled view of a session that has none.
function getHistory(config) {
  return Array.isArray(config.history) ? config.history : backfillHistory(config);
}

// Makes sure config.history is a list, backfilling it when it is missing
// (or, with a warning, when it is not a list). Returns it.
function ensureHistory(config) {
  if (Array.isArray(config.history)) return config.history;
  if (config.history !== undefined) {
    console.error('⚠️  history in .session-config.json is not a list; rebuilt from the stored timestamps.');
  }
  config.history = backfillHistory(config);
  return config.history;
}

function hasEvent(config, event, detail = {}) {
  return getHistory(config).some((e) => e.event === event
    && Object.entries(detail).every(([key, value]) => e.detail && e.detail[key] === value));
}

// Appends one event, sets current_phase to the phase after it and saves the
// config. Returns true when recorded, false (with a warning) on any error.
function recordEvent(configPath, config, sessionDir, { event, files, detail, at } = {}) {
  try {
    const hadHistory = Array.isArray(config.history);
    const history = ensureHistory(config);
    if (!hadHistory) {
      // The command just wrote the fact the backfill read: keep the real event, not its reconstruction.
      for (let i = history.length - 1; i >= 0; i -= 1) {
        const sameTicket = !detail || !detail.ticket || (history[i].detail && history[i].detail.ticket === detail.ticket);
        if (history[i].backfilled && history[i].event === event && sameTicket) history.splice(i, 1);
      }
    }

    const { phase } = computeSessionState(sessionDir, config);
    const entry = { at: at || new Date().toISOString(), event, phase };
    if (files && files.length > 0) entry.files = files;
    if (detail && Object.keys(detail).length > 0) entry.detail = detail;
    history.push(entry);
    config.current_phase = phase;
    writeJsonAtomic(configPath, config);
    return true;
  } catch (err) {
    console.error(`⚠️  Session history not recorded: ${err && err.message ? err.message : err}`);
    return false;
  }
}

// "YYYY-MM-DD HH:MM" in the machine's local time.
function localStamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const pad2 = (n) => String(n).padStart(2, '0');
  return `${localDate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

const cell = (text) => String(text).replace(/\|/g, '\\|');

function detailsCell(entry) {
  const parts = Object.entries(entry.detail || {}).map(([key, value]) => `${key}: ${value}`);
  if (entry.backfilled) parts.push('(reconstructed)');
  return parts.join(', ');
}

// Markdown lines of a "## Timeline" table (ending with an empty line).
function renderTimeline(events) {
  const lines = ['## Timeline', '', '| When | Phase | Event | Details | Files |', '|---|---|---|---|---|'];
  for (const e of events) {
    const files = (e.files || []).map((f) => `[${f}](${f})`).join(', ');
    const cells = [localStamp(e.at), e.phase || '', e.event, detailsCell(e), files].map(cell);
    lines.push(`| ${cells.join(' | ')} |`);
  }
  lines.push('');
  return lines;
}

module.exports = {
  sessionPath,
  backfillHistory,
  getHistory,
  ensureHistory,
  hasEvent,
  recordEvent,
  renderTimeline,
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node scripts/lib/history.test.js`
Expected: `# history.test.js: all assertions passed`

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/history.js scripts/lib/history.test.js
git commit -m "feat(history): record, backfill and render session events"
```

---

### Task 2: `ticket-done.js` and `ticket_started`

**Files:**
- Create: `scripts/lib/ticket-lookup.js`, `scripts/ticket-done.js`
- Rewrite: `scripts/ticket.js`
- Modify: `skills/gps/references/ship.md`, `skills/gps/references/ticket.md`, `scripts/handlers.test.js`

**Interfaces:**
- Consumes: `recordEvent`, `hasEvent`, `sessionPath` (Task 1); `listTickets`, `isTicketDone` from `./ticket-queue`; `resolveWriteTarget`.
- Produces:
  - `findTicketsByNumber(sessionDir, number) -> ticket[]` and `findTicketByNumber(sessionDir, number) -> ticket` in `scripts/lib/ticket-lookup.js` (tickets are `listTickets` entries: `{ num, slug, ticketPath, implDir, commitLogPath, done }`); both throw `GpsError` when the plan is missing/unwritten or the number is unknown.
  - `ticket.js` records `ticket_started` (once per ticket) with `files: [<ticket spec>, <commit-log>]`, `detail: { ticket: 'NN-<slug>' }`.
  - `node scripts/ticket-done.js <N>` records `ticket_done` with `files: ['03-implement/NN-<slug>/commit-log.md']`, `detail: { ticket: 'NN-<slug>' }`; refuses unless the log says `✅ Done`; idempotent.

- [ ] **Step 1: Write the failing tests**

In `scripts/handlers.test.js`, insert these two blocks immediately before the block that starts with the comment `// SKILL.md router: every command has a references file carrying its handler lines` (before its opening `{`):

```js
{
  // ticket-done.js records the exact completion time
  const root = tempProject();
  run(root, 'start-session.js', 'done-hook');
  fs.writeFileSync(payloadPath(root), sectionsPayload(GRILL_SECTIONS));
  assert.strictEqual(run(root, 'write-apply.js').code, 0);
  const configPath = path.join(sessionsDir(root), currentSession(root), '.session-config.json');
  const history = () => JSON.parse(fs.readFileSync(configPath, 'utf-8')).history;

  // no plan yet
  const early = run(root, 'ticket-done.js', '1');
  assert.strictEqual(early.code, 1);
  assert.match(early.err, /no tickets yet/);

  assert.strictEqual(run(root, 'plan.js').code, 0);
  writePlan(root, ['a']);
  assert.strictEqual(run(root, 'ticket-done.js').code, 1, 'a number is required');
  assert.match(run(root, 'ticket-done.js', '9').err, /Ticket 9 not found/);

  // ticket.js records ticket_started once, however often it runs
  assert.strictEqual(run(root, 'ticket.js', '1').code, 0);
  assert.strictEqual(run(root, 'ticket.js', '1').code, 0);
  const started = history().filter((e) => e.event === 'ticket_started');
  assert.strictEqual(started.length, 1);
  assert.deepStrictEqual(started[0].detail, { ticket: '01-a' });
  assert.deepStrictEqual(started[0].files, ['02-plan/tickets/01-a.md', '03-implement/01-a/commit-log.md']);

  // still In Progress -> refused, nothing recorded
  const refused = run(root, 'ticket-done.js', '1');
  assert.strictEqual(refused.code, 1);
  assert.match(refused.err, /not marked Done/);
  assert.ok(!history().some((e) => e.event === 'ticket_done'));

  markDone(root, '01-a');
  const recorded = run(root, 'ticket-done.js', '1');
  assert.strictEqual(recorded.code, 0, recorded.err);
  assert.match(recorded.out, /recorded as Done/);
  const events = history().filter((e) => e.event === 'ticket_done');
  assert.strictEqual(events.length, 1);
  assert.deepStrictEqual(events[0].files, ['03-implement/01-a/commit-log.md']);
  assert.deepStrictEqual(events[0].detail, { ticket: '01-a' });
  assert.strictEqual(events[0].phase, 'finish-pending');

  // idempotent: nothing changes the second time
  const before = fs.readFileSync(configPath, 'utf-8');
  const again = run(root, 'ticket-done.js', '1');
  assert.strictEqual(again.code, 0, again.err);
  assert.match(again.out, /already recorded as Done/);
  assert.strictEqual(fs.readFileSync(configPath, 'utf-8'), before);
}

{
  // duplicate ticket numbers: each Done ticket gets its own ticket_done event
  const root = tempProject();
  run(root, 'start-session.js', 'dup-done');
  writeResume(root);
  run(root, 'plan.js');
  writePlan(root, ['x']);
  const ticketsDir = path.join(sessionsDir(root), currentSession(root), '02-plan', 'tickets');
  fs.writeFileSync(path.join(ticketsDir, '01-y.md'), '# Ticket 01: y\n\nDo y.\n');
  const configPath = path.join(sessionsDir(root), currentSession(root), '.session-config.json');
  run(root, 'ticket.js', '1');
  markDone(root, '01-x');
  assert.strictEqual(run(root, 'ticket-done.js', '1').code, 0);
  run(root, 'ticket.js', '1'); // now picks 01-y
  markDone(root, '01-y');
  assert.strictEqual(run(root, 'ticket-done.js', '1').code, 0);
  const done = JSON.parse(fs.readFileSync(configPath, 'utf-8')).history.filter((e) => e.event === 'ticket_done');
  assert.deepStrictEqual(done.map((e) => e.detail.ticket), ['01-x', '01-y']);
}

```

- [ ] **Step 2: Run to verify failure**

Run: `node scripts/handlers.test.js`
Expected: FAIL (`ticket-done.js` does not exist; `early.code` is not 1).

- [ ] **Step 3: Create `scripts/lib/ticket-lookup.js`**

```js
// scripts/lib/ticket-lookup.js
//
// Finds a ticket by its number for /gps ticket and ticket-done.js. Lives
// apart from ticket-queue.js because write-target.js requires that module.

const fs = require('fs');
const path = require('path');
const { listTickets } = require('./ticket-queue');
const { resolveWriteTarget } = require('./write-target');
const { GpsError } = require('./guard');

// Every valid ticket with this number (duplicates are all kept), in filename
// order. Throws a GpsError when the plan is not written or none matches.
function findTicketsByNumber(sessionDir, ticketNum) {
  const ticketsDir = path.join(sessionDir, '02-plan', 'tickets');
  if (!fs.existsSync(ticketsDir)) {
    throw new GpsError('This session has no tickets yet.', 'Run /gps plan, then /gps write, then /gps ticket <N>.');
  }

  const writeTarget = resolveWriteTarget(sessionDir).target;
  if (writeTarget === 'grill') {
    throw new GpsError('The grill phase is not written yet.', 'Run /gps write, then /gps plan.');
  }
  if (writeTarget === 'plan') {
    throw new GpsError('The plan and tickets are not written yet.', 'Run /gps write to save them, then /gps ticket <N>.');
  }

  const { tickets, skipped } = listTickets(sessionDir);
  for (const fileName of skipped) {
    console.error(`⚠️  Skipped ${fileName}: ticket files must be named NN-<slug>.md`);
  }
  const candidates = tickets.filter((t) => Number(t.num) === ticketNum);

  if (candidates.length === 0) {
    throw new GpsError(`Ticket ${ticketNum} not found.`, 'Run /gps ship or /gps status to list the tickets.');
  }
  return candidates;
}

// The first not-yet-done ticket with this number, else the first.
function findTicketByNumber(sessionDir, ticketNum) {
  const candidates = findTicketsByNumber(sessionDir, ticketNum);
  return candidates.find((t) => !t.done) || candidates[0];
}

module.exports = { findTicketsByNumber, findTicketByNumber };
```

- [ ] **Step 4: Rewrite `scripts/ticket.js`** (same behaviour, lookup moved out, `ticket_started` recorded)

Replace the whole file with:

```js
#!/usr/bin/env node

/**
 * /gps ticket <number>
 *
 * Reads ticket spec, creates implementation directory, prints spec.
 *
 * - Refuses to run until the plan phase is written (no stub tickets).
 * - An existing commit-log.md is never overwritten: a Done ticket is
 *   reported and left alone; an unfinished one keeps its log and the spec
 *   is printed again.
 * - Several files with the same number are all valid tickets; the first
 *   not-yet-done one (alphabetical filename order) is picked.
 * - Records a `ticket_started` event in the session history, once per ticket.
 */

const fs = require('fs');
const { loadTemplate, renderTemplate } = require('./lib/templates');
const { resolveSession } = require('./lib/session-store');
const { isTicketDone } = require('./lib/ticket-queue');
const { findTicketByNumber } = require('./lib/ticket-lookup');
const { touchPhase } = require('./lib/token-usage');
const { hasEvent, recordEvent, sessionPath } = require('./lib/history');
const { ensureScratchDir } = require('./lib/scratch-dir');
const { GpsError, writeJsonAtomic, runCli } = require('./lib/guard');

function implementTicket(ticketNum) {
  const projectRoot = process.cwd();
  const { sessionId, sessionDir, configPath, config } = resolveSession(projectRoot);
  const ticket = findTicketByNumber(sessionDir, ticketNum);
  const phaseKey = `03-${ticket.num}-${ticket.slug}`;
  const ticketKey = `${ticket.num}-${ticket.slug}`;

  if (isTicketDone(ticket.commitLogPath)) {
    console.log(`✅ Ticket ${ticket.num} (${ticket.slug}) is already Done; nothing was changed.`);
    console.log(`Log file: ${ticket.commitLogPath}`);
    return;
  }

  fs.mkdirSync(ticket.implDir, { recursive: true });

  const alreadyStarted = hasEvent(config, 'ticket_started', { ticket: ticketKey });
  touchPhase(config, phaseKey);
  if (!config.scratch_dir) {
    console.error(`⚠️  ${sessionId} predates scratch dirs; adding scratch_dir to its config.`);
  }
  const scratchDir = ensureScratchDir(projectRoot, sessionId);
  config.scratch_dir = scratchDir;
  writeJsonAtomic(configPath, config);

  const logExisted = fs.existsSync(ticket.commitLogPath);
  if (!logExisted) {
    const logContent = renderTemplate(loadTemplate('03-implement-log.md'), { N: ticket.num });
    fs.writeFileSync(ticket.commitLogPath, logContent);
  }

  if (!alreadyStarted) {
    recordEvent(configPath, config, sessionDir, {
      event: 'ticket_started',
      files: [sessionPath(sessionDir, ticket.ticketPath), sessionPath(sessionDir, ticket.commitLogPath)],
      detail: { ticket: ticketKey },
    });
  }

  const ticketContent = fs.readFileSync(ticket.ticketPath, 'utf-8');
  console.log('\n' + '='.repeat(70));
  console.log(`TICKET SPEC - ${ticket.num}`);
  console.log('='.repeat(70) + '\n');
  console.log(ticketContent);
  console.log('\n' + '='.repeat(70));
  console.log(`Working directory: ${ticket.implDir}`);
  console.log(`Scratch dir: ${scratchDir}  (all build/run/test output goes here; prefix files with ${ticket.num}-)`);
  console.log(`Log file: ${ticket.commitLogPath}${logExisted ? '  (existing log kept — resume from it)' : ''}`);
  console.log(`Token usage phase key: ${phaseKey}`);
  console.log('\nImplement in Claude Code, test locally, save results to commit-log.md');
  console.log('='.repeat(70) + '\n');
}

runCli(() => {
  const arg = process.argv[2];
  if (!arg || !/^\d+$/.test(arg)) {
    throw new GpsError('Missing or invalid ticket number.', 'Usage: /gps ticket <number>  (e.g. /gps ticket 3)');
  }
  implementTicket(Number(arg));
});
```

- [ ] **Step 5: Create `scripts/ticket-done.js`**

```js
#!/usr/bin/env node

/**
 * ticket-done.js <number>
 *
 * Called right after a ticket's commit-log.md Status line is set to
 * "✅ Done": records a `ticket_done` event (exact time + the log's path) in
 * the session history. Refuses, changing nothing, unless the log really says
 * Done. Idempotent: a ticket already recorded is left alone. With several
 * tickets sharing a number it records the first one that is Done and not
 * yet recorded.
 */

const { resolveSession } = require('./lib/session-store');
const { findTicketsByNumber } = require('./lib/ticket-lookup');
const { hasEvent, recordEvent, sessionPath } = require('./lib/history');
const { GpsError, runCli } = require('./lib/guard');

runCli(() => {
  const arg = process.argv[2];
  if (!arg || !/^\d+$/.test(arg)) {
    throw new GpsError('Missing or invalid ticket number.', 'Usage: ticket-done.js <number>  (e.g. ticket-done.js 3)');
  }

  const { sessionDir, configPath, config } = resolveSession(process.cwd());
  const candidates = findTicketsByNumber(sessionDir, Number(arg));
  const keyOf = (t) => `${t.num}-${t.slug}`;
  const recorded = (t) => hasEvent(config, 'ticket_done', { ticket: keyOf(t) });

  const ticket = candidates.find((t) => t.done && !recorded(t)) || candidates.find((t) => t.done);
  if (!ticket) {
    const first = candidates[0];
    throw new GpsError(
      `Ticket ${first.num} (${first.slug}) is not marked Done in its commit-log.md; nothing was recorded.`,
      `Set its Status line to exactly "**Status:** ✅ Done" in ${first.commitLogPath}, then run this again.`
    );
  }

  if (recorded(ticket)) {
    console.log(`✅ Ticket ${ticket.num} (${ticket.slug}) was already recorded as Done; nothing was changed.`);
    return;
  }

  recordEvent(configPath, config, sessionDir, {
    event: 'ticket_done',
    files: [sessionPath(sessionDir, ticket.commitLogPath)],
    detail: { ticket: keyOf(ticket) },
  });
  console.log(`✅ Ticket ${ticket.num} (${ticket.slug}) recorded as Done.`);
});
```

- [ ] **Step 6: Document the hook**

In `skills/gps/references/ship.md`:

1. In the **Inline mode** on-success bullet, after `— \`unavailable\` per line if the script returned \`available: false\`).` insert (same paragraph, one space after the period): ` Then run \`node $CLAUDE_PLUGIN_ROOT/scripts/ticket-done.js <N>\` (\`<N>\` is the ticket number): it records when the ticket was completed in the session history and refuses unless the Status line says \`✅ Done\`.`
2. In the **Subagent mode** contract bullet, replace `then fill in \`commit-log.md\`, stage only touched files, commit referencing the ticket;` with `then fill in \`commit-log.md\`, run \`node $CLAUDE_PLUGIN_ROOT/scripts/ticket-done.js <N>\` with the ticket number filled in, stage only touched files, commit referencing the ticket;`.

In `skills/gps/references/ticket.md`, after step 6 add:

```
7. Records a `ticket_started` event (once per ticket) in the session history in `.session-config.json`.

When the ticket is done — its Status line set to exactly `**Status:** ✅ Done` — run `node $CLAUDE_PLUGIN_ROOT/scripts/ticket-done.js <number>` to record the completion time. It refuses unless the log says Done, and does nothing if the ticket was already recorded.
```

- [ ] **Step 7: Run the tests**

Run: `node scripts/handlers.test.js`
Expected: `handlers.test.js: all assertions passed`

Run: `npm test`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add scripts skills
git commit -m "feat(history): ticket-done.js and ticket_started events"
```

---

### Task 3: Record the other handler events, and report drift in status

**Files:**
- Modify: `scripts/start-session.js`, `scripts/plan.js`, `scripts/write-apply.js`, `scripts/handoff.js`, `scripts/lib/status.js`, `skills/gps/references/status.md`, `scripts/handlers.test.js`, `scripts/lib/status.test.js`

**Interfaces:**
- Consumes: `recordEvent`, `sessionPath` (Task 1).
- Produces:
  - New sessions are created with `history: []` and record `session_started` (`at` = `created_at`).
  - `plan.js` records `plan_started`; `write-apply.js` records `grill_written` / `plan_written` (plan: `files` = `02-plan/plan.md` + every ticket file, `detail: { tickets: N }`); `handoff.js` records `handoff_saved`.
  - `summarizeSession` returns `currentPhase` (string or `null`) and `phaseDrift` (`{ recorded, derived }` or `null`).

- [ ] **Step 1: Write the failing tests**

In `scripts/handlers.test.js`, insert this block right after the two blocks added in Task 2 (before the router block):

```js
{
  // every handler records its event: start, grill, plan, plan write, handoff
  const root = tempProject();
  run(root, 'start-session.js', 'events');
  const dir = path.join(sessionsDir(root), currentSession(root));
  const configPath = path.join(dir, '.session-config.json');
  const readConfig = () => JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  assert.deepStrictEqual(readConfig().history.map((e) => [e.event, e.phase]), [['session_started', 'grill']]);
  assert.strictEqual(readConfig().history[0].at, readConfig().created_at);
  assert.deepStrictEqual(readConfig().history[0].files, ['01-grill/resume.md']);
  assert.strictEqual(readConfig().current_phase, 'grill');

  fs.writeFileSync(payloadPath(root), sectionsPayload(GRILL_SECTIONS));
  assert.strictEqual(run(root, 'write-apply.js').code, 0);
  assert.strictEqual(run(root, 'plan.js').code, 0);
  writePlan(root, ['a', 'b']);
  assert.strictEqual(run(root, 'handoff.js').code, 0);

  const history = readConfig().history;
  assert.deepStrictEqual(history.map((e) => [e.event, e.phase]), [
    ['session_started', 'grill'],
    ['grill_written', 'plan-not-started'],
    ['plan_started', 'plan'],
    ['plan_written', 'ship'],
    ['handoff_saved', 'ship'],
  ]);
  assert.deepStrictEqual(history[1].files, ['01-grill/resume.md']);
  assert.deepStrictEqual(history[3].files, ['02-plan/plan.md', '02-plan/tickets/01-a.md', '02-plan/tickets/02-b.md']);
  assert.deepStrictEqual(history[3].detail, { tickets: 2 });
  assert.deepStrictEqual(history[4].files, ['HANDOFF.md']);
  assert.strictEqual(readConfig().current_phase, 'ship');
}

{
  // a session created before history existed is backfilled on its next recorded event
  const root = tempProject();
  run(root, 'start-session.js', 'legacy');
  writeResume(root);
  const configPath = path.join(sessionsDir(root), currentSession(root), '.session-config.json');
  const legacy = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  delete legacy.history;
  delete legacy.current_phase;
  fs.writeFileSync(configPath, JSON.stringify(legacy));

  assert.strictEqual(run(root, 'plan.js').code, 0);
  const after = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  assert.deepStrictEqual(
    after.history.map((e) => [e.event, Boolean(e.backfilled)]),
    [['session_started', true], ['plan_started', false]]
  );
  assert.strictEqual(after.current_phase, 'plan');
}

```

Also in `scripts/handlers.test.js`, right after that block, add the drift block (the recorded phase drifts when a ticket is set to Done by hand, and `ticket-done.js` heals it):

```js
{
  // status reports drift until ticket-done.js records the completion
  const root = tempProject();
  run(root, 'start-session.js', 'drift');
  fs.writeFileSync(payloadPath(root), sectionsPayload(GRILL_SECTIONS));
  assert.strictEqual(run(root, 'write-apply.js').code, 0);
  assert.strictEqual(run(root, 'plan.js').code, 0);
  writePlan(root, ['a']);
  assert.strictEqual(run(root, 'ticket.js', '1').code, 0);
  const summaryOf = () => JSON.parse(run(root, 'status.js').out).sessions.find((s) => s.sessionId === currentSession(root));

  assert.strictEqual(summaryOf().phaseDrift, null);
  markDone(root, '01-a');
  assert.deepStrictEqual(summaryOf().phaseDrift, { recorded: 'ship', derived: 'finish-pending' });
  assert.strictEqual(run(root, 'ticket-done.js', '1').code, 0);
  assert.strictEqual(summaryOf().phaseDrift, null);
  assert.strictEqual(summaryOf().currentPhase, 'finish-pending');
}

```

In `scripts/lib/status.test.js`, insert this block immediately before the line `fs.rmSync(projectRoot, { recursive: true, force: true });`:

```js
// Recorded phase vs derived phase: drift is reported, never fixed silently.
{
  const driftId = '2026-09-01__drift';
  const driftDir = path.join(sessionsDir, driftId);
  fs.mkdirSync(path.join(driftDir, '01-grill'), { recursive: true });
  fs.writeFileSync(path.join(driftDir, '01-grill', 'resume.md'), '# S\n\n<!-- gps:fill x -->\n');
  const writeConfig = (extra) => fs.writeFileSync(path.join(driftDir, '.session-config.json'), JSON.stringify({
    session_id: driftId, feature_name: 'drift', created_at: '2026-09-01T08:00:00.000Z', template_version: 2, ...extra,
  }));
  const summary = () => buildStatusReport(sessionsDir, projectRoot).sessions.find((s) => s.sessionId === driftId);

  writeConfig({});
  assert.strictEqual(summary().currentPhase, null);
  assert.strictEqual(summary().phaseDrift, null);

  writeConfig({ current_phase: 'grill' });
  assert.strictEqual(summary().currentPhase, 'grill');
  assert.strictEqual(summary().phaseDrift, null);

  writeConfig({ current_phase: 'ship' });
  assert.deepStrictEqual(summary().phaseDrift, { recorded: 'ship', derived: 'grill' });
}

```

- [ ] **Step 2: Run to verify failure**

Run: `node scripts/handlers.test.js`
Expected: FAIL at `assert.deepStrictEqual(readConfig().history.map(...), [['session_started', 'grill']])` (`history` is undefined).

Run: `node scripts/lib/status.test.js`
Expected: FAIL (`summary().currentPhase` is undefined, not `null`).

- [ ] **Step 3: `scripts/start-session.js` records `session_started`**

1. Add the import after the `token-usage` require: `const { recordEvent } = require('./lib/history');`
2. In the `config` object literal add `history: [],` after `template_version: TEMPLATE_VERSION,`.
3. Replace `  writeJsonAtomic(path.join(workDir, '.session-config.json'), config);` with:

```js
  const configPath = path.join(workDir, '.session-config.json');
  writeJsonAtomic(configPath, config);
```

4. After the `INDEX.md` write (the `fs.writeFileSync(\n    path.join(workDir, 'INDEX.md'), ... );` statement) and before `setCurrentSession(sessionsDir, sessionId);` add:

```js
  recordEvent(configPath, config, workDir, { event: 'session_started', files: ['01-grill/resume.md'], at: config.created_at });
```

- [ ] **Step 4: `scripts/plan.js` records `plan_started`**

Add the import `const { recordEvent } = require('./lib/history');` after the `token-usage` require. Replace

```js
  touchPhase(config, 'plan');
  writeJsonAtomic(configPath, config);
```

with

```js
  touchPhase(config, 'plan');
  writeJsonAtomic(configPath, config);
  recordEvent(configPath, config, sessionDir, { event: 'plan_started', files: ['02-plan/plan.md'] });
```

- [ ] **Step 5: `scripts/write-apply.js` records `grill_written` / `plan_written`**

1. Add the import after the `token-usage` require: `const { recordEvent, sessionPath } = require('./lib/history');`
2. In the grill block, replace

```js
    fs.unlinkSync(payloadPath);
    console.log(`✅ Grill written for ${sessionId}. Next: /gps plan`);
```

with

```js
    recordEvent(configPath, config, sessionDir, { event: 'grill_written', files: ['01-grill/resume.md'] });
    fs.unlinkSync(payloadPath);
    console.log(`✅ Grill written for ${sessionId}. Next: /gps plan`);
```

3. In the plan tail, replace

```js
  fs.unlinkSync(payloadPath);
  console.log(`✅ Plan written for ${sessionId}: ${tickets.length} ticket(s). Next: /gps ship`);
```

with

```js
  recordEvent(configPath, config, sessionDir, {
    event: 'plan_written',
    files: ['02-plan/plan.md', ...tickets.map((t) => sessionPath(sessionDir, t.ticketPath))],
    detail: { tickets: tickets.length },
  });
  fs.unlinkSync(payloadPath);
  console.log(`✅ Plan written for ${sessionId}: ${tickets.length} ticket(s). Next: /gps ship`);
```

- [ ] **Step 6: `scripts/handoff.js` records `handoff_saved`**

Add the import after the `guard` require: `const { recordEvent } = require('./lib/history');`. In `main`, replace `const { sessionDir } = resolveSession(projectRoot);` with `const { sessionDir, configPath, config } = resolveSession(projectRoot);` and after `fs.writeFileSync(handoffPath, rendered);` add:

```js
  recordEvent(configPath, config, sessionDir, { event: 'handoff_saved', files: ['HANDOFF.md'] });
```

- [ ] **Step 7: `scripts/lib/status.js` reports `currentPhase` and `phaseDrift`**

In `summarizeSession`, after the `phase,` line add:

```js
    currentPhase: config && config.current_phase ? config.current_phase : null,
    phaseDrift: config && config.current_phase && config.current_phase !== phase
      ? { recorded: config.current_phase, derived: phase }
      : null,
```

- [ ] **Step 8: Document drift in `skills/gps/references/status.md`**

1. In the first bullet of step 1's output description, replace ``and `phase` (computed from the session's files:`` with ```currentPhase` (the phase the last handler recorded in the config; `null` for older sessions), `phaseDrift` (`{ recorded, derived }` when the recorded phase differs from the derived one, else `null`), and `phase` (computed from the session's files:``.
2. After the line `   - One line per session: feature name and phase, plus its branch and PR link when set.` add:

```
   - If a session's `phaseDrift` is not null, say so. The usual cause is a ticket set to `✅ Done` without running `ticket-done.js <N>`; running it fixes the record. `phase` is always the truth.
```

- [ ] **Step 9: Run the tests**

Run: `node scripts/handlers.test.js && node scripts/lib/status.test.js`
Expected: both print `all assertions passed`.

Run: `npm test`
Expected: exit 0 (this includes `e2e.test.js`, which proves `status.js` and `resume.js` still change nothing under `.work/`).

- [ ] **Step 10: Commit**

```bash
git add scripts skills
git commit -m "feat(history): record start, grill, plan and handoff events; report phase drift"
```

---

### Task 4: Timeline in `INDEX.md` at finish, e2e coverage and docs

**Files:**
- Modify: `scripts/finish.js`, `scripts/e2e.test.js`, `README.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: `getHistory`, `renderTimeline`, `recordEvent` (Task 1).
- Produces: `finish.js` writes a `## Timeline` section (before `## Next`) built from `getHistory(config)` plus its own `session_finished` event, then records `session_finished` (same `at`) after INDEX.md is written. `buildIndex(config, finishedAt, tickets, bounded, pr, events)` takes the events as its last parameter.

- [ ] **Step 1: Extend `scripts/e2e.test.js` (failing test)**

1. In `expectStatus`, after `assert.strictEqual(report.current.phase, phase);` add:

```js
  assert.ok(report.sessions.every((s) => s.phaseDrift === null), 'the recorded phase drifted from the derived phase');
```

2. In the ship loop, after the line `fs.writeFileSync(log, fs.readFileSync(log, 'utf-8').replace(/^\*\*Status:\*\*.*$/m, '**Status:** ✅ Done'));` add:

```js
  ok('ticket-done.js', num);
```

3. After the line `assert.ok(!fs.existsSync(path.join(root, '.work', 'sessions', '.current-session')));` add:

```js
// history: every step is in the config, in order, with the phase after it
const finalConfig = JSON.parse(fs.readFileSync(path.join(sessionDir, '.session-config.json'), 'utf-8'));
assert.deepStrictEqual(finalConfig.history.map((e) => e.event), [
  'session_started', 'grill_written', 'plan_started', 'plan_written',
  'ticket_started', 'ticket_done', 'ticket_started', 'ticket_done',
  'handoff_saved', 'session_finished',
]);
assert.deepStrictEqual(finalConfig.history.map((e) => e.phase), [
  'grill', 'plan-not-started', 'plan', 'ship',
  'ship', 'ship', 'ship', 'finish-pending',
  'finish-pending', 'finished',
]);
const stamps = finalConfig.history.map((e) => e.at);
assert.deepStrictEqual(stamps, [...stamps].sort(), 'events are in chronological order');
assert.strictEqual(finalConfig.current_phase, 'finished');
assert.ok(finalConfig.history.every((e) => !e.backfilled));
assert.match(index, /## Timeline/);
assert.match(index, /\| session_finished \|/);
const links = [...index.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]);
assert.ok(links.includes('03-implement/01-toggle/commit-log.md'));
for (const link of links) {
  assert.ok(fs.existsSync(path.join(sessionDir, link)), `INDEX.md links to a missing file: ${link}`);
}
```

- [ ] **Step 2: Run to verify failure**

Run: `node scripts/e2e.test.js`
Expected: FAIL at the `history.map(...)` assertion (no `session_finished` event yet) or at `assert.match(index, /## Timeline/)`.

- [ ] **Step 3: Implement in `scripts/finish.js`**

1. Header comment: after the line ` * A bounded session (resume written, no plan) may finish with no tickets.` add:

```
 *
 * INDEX.md gets a "## Timeline" built from the session history (see
 * lib/history.js) plus the session_finished event, which is recorded after
 * INDEX.md is written.
```

2. Add the import after the `guard` require: `const { getHistory, renderTimeline, recordEvent } = require('./lib/history');`
3. Change the signature `function buildIndex(config, finishedAt, tickets, bounded, pr) {` to `function buildIndex(config, finishedAt, tickets, bounded, pr, events) {` and replace

```js
  lines.push('## Next', '', 'Start a new feature with /gps start <next-feature>', '');
```

with

```js
  lines.push(...renderTimeline(events));
  lines.push('## Next', '', 'Start a new feature with /gps start <next-feature>', '');
```

4. In `finishSession`, replace

```js
  const finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(sessionDir, 'INDEX.md'), buildIndex(config, finishedAt, tickets, bounded, pr));

  config.finished_at = finishedAt;
  writeJsonAtomic(configPath, config);
```

with

```js
  const finishedAt = new Date().toISOString();
  const events = [
    ...getHistory(config),
    { at: finishedAt, event: 'session_finished', phase: 'finished', files: ['INDEX.md'] },
  ];
  fs.writeFileSync(path.join(sessionDir, 'INDEX.md'), buildIndex(config, finishedAt, tickets, bounded, pr, events));

  config.finished_at = finishedAt;
  writeJsonAtomic(configPath, config);
  recordEvent(configPath, config, sessionDir, { event: 'session_finished', files: ['INDEX.md'], at: finishedAt });
```

- [ ] **Step 4: Run the e2e test and the whole suite**

Run: `node scripts/e2e.test.js`
Expected: `e2e.test.js: all assertions passed`

Run: `npm test`
Expected: exit 0.

- [ ] **Step 5: Docs**

In `README.md`, immediately before the line `## Branches and Pull Requests` insert:

````markdown
## Session history

Every `.session-config.json` records the life of its session, so a timeline can be built from that file alone:

- `history` — append-only events `{ at, event, phase, files, detail }`: `session_started`, `grill_written`, `plan_started`, `plan_written`, `ticket_started`, `ticket_done`, `handoff_saved`, `session_finished`. `files` point at the session's `.md` files, relative to its directory.
- `current_phase` — the phase after the last event. `/gps status` still derives the phase from the files and reports `phaseDrift` when the two disagree (typically a ticket set to `✅ Done` without `ticket-done.js <N>`).
- `ticket-done.js <N>` records the exact time a ticket was completed; `/gps ship` and `/gps ticket` run it after the Status line is set.
- `/gps finish` renders the history as a `## Timeline` table in `INDEX.md`, with links to the files.

Sessions created before this feature are backfilled from their stored timestamps (`created_at`, phase start times, `finished_at`) and shown as "(reconstructed)".

````

In `CLAUDE.md`:

1. In the architecture tree, after the line `│   ├── ticket-queue.js       ← Lists tickets + next pending one for /gps ship` add `│   ├── ticket-done.js        ← Records a ticket's completion in the session history`, and change `Shared helpers (session-store, templates, write-target, write-payload, ticket-queue, github) + tests` to `Shared helpers (session-store, history, ticket-lookup, templates, write-target, write-payload, ticket-queue, github) + tests`.
2. In the "Session Structure" tree, replace `← Machine state (session ID, status, tickets, \`git\` branch/PR on GitHub projects)` with `← Machine state (session ID, \`current_phase\`, \`history\` timeline events, usage, and \`git\` branch/PR on GitHub projects)`.
3. Under "When working on handlers (*.js)" add the bullet: `- Record each state change with \`recordEvent\` (scripts/lib/history.js) after the files are written; it never throws`.

- [ ] **Step 6: Final verification and commit**

Run: `npm test`
Expected: exit 0.

Run: `git status --short`
Expected: only the files listed in this task are modified.

```bash
git add scripts README.md CLAUDE.md
git commit -m "feat(history): timeline in INDEX.md at finish, e2e coverage, docs"
```
