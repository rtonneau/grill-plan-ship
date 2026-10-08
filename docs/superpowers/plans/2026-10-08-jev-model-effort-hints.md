# Jev-judged ticket Model/Effort hints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When `TYPESAFE_API_KEY` is set and not hand-disabled, `/gps plan` asks TypeSafe's Jev to judge each ticket's `**Model:**`/`**Effort:**` hint from its drafted content, in one batched call per plan run, falling back to Claude's existing heuristic per-ticket whenever Jev isn't configured or its call fails.

**Architecture:** A new `lib/jev.js` wraps the one `POST /v1/systemone` call (built-in `fetch`, no SDK). A new `jev-hints.js` script reads drafted ticket blocks from stdin (reusing `write-payload.js`'s `parsePayload`), gates on a new `jev.enabled` flag in `.work/gps-config.json` (mirroring `github.enabled`), and never throws — "not enabled" and "call failed" return the same `{ used: false }` shape so `references/plan.md`'s fallback logic doesn't need to branch. Because `fetch` is async and the existing `lib/cli.js` contract (`runScript`/`main`) is synchronous, a new parallel `runScriptAsync`/`mainAsync` pair is added rather than changing the existing one.

**Tech Stack:** Node.js (>=20) built-ins only — `fetch`, `AbortController`. No new npm dependency.

**Spec:** [docs/superpowers/specs/2026-10-08-jev-model-effort-hints-design.md](../specs/2026-10-08-jev-model-effort-hints-design.md)

## Global Constraints

- Node built-ins only; no new npm dependency (`fetch`/`AbortController` are native on Node >=20).
- Every script's entry point stays the `lib/cli.js` contract: `UsageError` → exit 2, `GpsError` → exit 1, `warn()` for non-fatal messages, never `process.exit`. `jev-hints.js` never throws a `GpsError`/`UsageError` for "Jev not enabled" or "Jev call failed" — only for genuinely bad input (unparsable stdin).
- `TYPESAFE_API_KEY` is read only from `process.env` at call time; it is never read from or written to `.work/gps-config.json`.
- A ticket's `**Model:**` line stays one of `haiku`/`sonnet`/`opus`/`inherit` (`TICKET_MODELS`, decision 0004, unchanged) — Jev's version-named answer is collapsed to family before being written there; the raw answer goes only in the new `**Model (Jev):**` line, which nothing downstream reads.
- `references/<cmd>.md` files stay ≤ 40 lines; `SKILL.md` stays < 100 lines (both checked by `tests/skill.test.js`); a new script needs its own `allowed-tools` line there.
- Every script needs `tests/<name>.test.js`; every `lib/` file needs `tests/lib/<name>.test.js` (checked by `tests/skill.test.js`).

## Review Focus

- `jev.enabled` hand-forced to `false` in `.work/gps-config.json` while `TYPESAFE_API_KEY` is still set must stop `jev-hints.js` from calling the API at all — the override must actually override, not just change what's logged.
- Jev returning a `model_<name>` choice outside the 5 known criteria (or an unmapped one) must raise a typed error, not silently produce an invalid `**Model:**` value — this is the one path that could otherwise corrupt a ticket decision 0004 depends on.
- A malformed stdin block (ticket name that fails `NN-<slug>` validation, or an unclosed code fence) must be rejected with a clear usage error, not silently dropped or mismatched to the wrong ticket.
- The "not enabled" and "call failed" result shapes from `jev-hints.js` must be identical (`{ used: false, reason, tickets: {} }`) so a caller's fallback logic never has to special-case which one happened.
- An existing `.work/gps-config.json` written before this feature (no `jev` key at all) must keep validating and `jevEnabled()` must read as `false`, never throw.

---

### Task 1: Async entry point in `lib/cli.js`

**Files:**
- Modify: `skills/gps/scripts/lib/cli.js`
- Test: `tests/lib/cli.test.js`

**Interfaces:**
- Produces: `runScriptAsync(spec, argv = process.argv.slice(2)): Promise<number>` and `mainAsync(spec): void` — same `spec` shape as `runScript`/`main` (`{ usage, positionals, options, run }`), but `run` may return a Promise of `{ text, data }`. Existing `runScript`/`main`, `parseArgs`, `printFailure`, `warn`, `EXIT_OK`/`EXIT_FAILURE`/`EXIT_USAGE` are unchanged and still exported.

- [ ] **Step 1: Write the failing tests**

In `tests/lib/cli.test.js`, after the existing `runScript` assertions, add (importing `runScriptAsync` alongside the existing imports):

```js
async function captureAsync(fn) {
  const out = [];
  const err = [];
  const { log, error } = console;
  console.log = (...a) => out.push(a.join(' '));
  console.error = (...a) => err.push(a.join(' '));
  try {
    return { code: await fn(), out: out.join('\n'), err: err.join('\n') };
  } finally {
    console.log = log;
    console.error = error;
  }
}

(async () => {
  let res = await captureAsync(() => runScriptAsync(script(async () => ({ text: 'hello', data: { a: 1 } })), []));
  assert.deepStrictEqual(res, { code: EXIT_OK, out: 'hello', err: '' });

  res = await captureAsync(() => runScriptAsync(script(async () => { throw new GpsError('It broke.', 'Do this.'); }), []));
  assert.deepStrictEqual(res, { code: EXIT_FAILURE, out: '', err: '❌ It broke.\n   Do this.' });

  res = await captureAsync(() => runScriptAsync(script(async () => ({ text: 'x' })), ['--nope']));
  assert.deepStrictEqual(res, { code: EXIT_USAGE, out: '', err: '❌ Unknown option: --nope\n   Usage: demo.js [--json]' });

  console.log('cli.test.js: all async assertions passed');
})();
```

(`script` and `EXIT_*`/`GpsError` are already imported/defined earlier in the file; add `runScriptAsync` to the `require` line.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lib/cli.test.js`
Expected: FAIL — `runScriptAsync is not a function` (or `undefined`).

- [ ] **Step 3: Implement `runScriptAsync`/`mainAsync` in `skills/gps/scripts/lib/cli.js`**

Mirror `runScript`/`main`'s bodies exactly, but `await spec.run(...)` inside the `try`, and have `mainAsync` call `runScriptAsync(spec).then((code) => { process.exitCode = code; })`. Export both alongside the existing names. Do not change `runScript`/`main`/`parseArgs`/`printFailure`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/lib/cli.test.js`
Expected: PASS (both the pre-existing sync assertions and the new async ones).

- [ ] **Step 5: Commit**

```bash
git add skills/gps/scripts/lib/cli.js tests/lib/cli.test.js
git commit -m "feat(gps): add an async entry point to the script contract"
```

---

### Task 2: `lib/jev.js` — the Jev HTTP call

**Files:**
- Create: `skills/gps/scripts/lib/jev.js`
- Test: `tests/lib/jev.test.js`

**Interfaces:**
- Produces:
  - `class JevError extends Error {}`
  - `MODEL_CRITERIA: { [key: string]: string }` — keys `'haiku-5.5' | 'sonnet-5' | 'sonnet-5.5' | 'opus-5' | 'opus-5.5'`
  - `EFFORT_CRITERIA: { [key: string]: string }` — keys `'low' | 'medium' | 'high' | 'xhigh'`
  - `FAMILY_BY_MODEL: { [key in keyof MODEL_CRITERIA]: 'haiku' | 'sonnet' | 'opus' }`
  - `diagnoseJev(): { enabled: boolean, reason: string }`
  - `async classifyTickets(tickets: Array<{ name: string, body: string }>): Promise<{ [name: string]: { model: string, modelRaw: string, modelConfidence: number, effort: string, effortConfidence: number } }>` — throws `JevError` on any failure (missing key, network error, timeout, non-2xx, malformed/incomplete response, unknown criteria in the response).
- Consumes: nothing project-internal (only Node built-ins `fetch`, `AbortController`).

Base URL override `GPS_JEV_BASE_URL` (default `https://api.typesafe.ai`) and timeout override `GPS_JEV_TIMEOUT_MS` (default `15000`) are test-only seams, read once at module load, same spirit as `GPS_GH_BIN` in `lib/github.js`.

- [ ] **Step 1: Write the failing tests**

`tests/lib/jev.test.js`, using a local stub HTTP server (Node's built-in `http`) instead of a live network call:

```js
const assert = require('assert');
const http = require('http');

function stubServer(handler) {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => handler(JSON.parse(body), req, res));
  });
  server.listen(0);
  return server;
}

delete process.env.TYPESAFE_API_KEY;
const { diagnoseJev, classifyTickets, JevError, FAMILY_BY_MODEL } = require('../../skills/gps/scripts/lib/jev');

assert.deepStrictEqual(diagnoseJev(), { enabled: false, reason: 'TYPESAFE_API_KEY is not set' });
process.env.TYPESAFE_API_KEY = 'test-key';
assert.deepStrictEqual(diagnoseJev(), { enabled: true, reason: 'TYPESAFE_API_KEY is set' });

(async () => {
  // Success: 2 tickets, family collapse for every MODEL_CRITERIA key, effort passed through.
  let seenAuth;
  let server = stubServer((reqBody, req, res) => {
    seenAuth = req.headers.authorization;
    const answers = {};
    for (const name of Object.keys(reqBody.state.tickets.reduce((m, t) => ({ ...m, [t.name]: 1 }), {}))) {
      answers[`model_${name}`] = { type: 'choice', choice: name === '01-a' ? 'sonnet-5.5' : 'haiku-5.5', probabilities: {}, confidence: 0.8 };
      answers[`effort_${name}`] = { type: 'choice', choice: name === '01-a' ? 'high' : 'low', probabilities: {}, confidence: 0.7 };
    }
    res.end(JSON.stringify({ model: 'jev-1', answers, usage: { input_tokens: 1, output_tokens: 1 } }));
  });
  process.env.GPS_JEV_BASE_URL = `http://127.0.0.1:${server.address().port}`;
  const result = await classifyTickets([{ name: '01-a', body: 'Body A' }, { name: '02-b', body: 'Body B' }]);
  assert.strictEqual(seenAuth, 'Bearer test-key');
  assert.deepStrictEqual(result, {
    '01-a': { model: 'sonnet', modelRaw: 'sonnet-5.5', modelConfidence: 0.8, effort: 'high', effortConfidence: 0.7 },
    '02-b': { model: 'haiku', modelRaw: 'haiku-5.5', modelConfidence: 0.8, effort: 'low', effortConfidence: 0.7 },
  });
  server.close();

  // Every MODEL_CRITERIA key collapses to the right family.
  for (const [raw, family] of Object.entries(FAMILY_BY_MODEL)) {
    server = stubServer((reqBody, req, res) => res.end(JSON.stringify({
      model: 'jev-1',
      answers: { 'model_01-a': { type: 'choice', choice: raw, confidence: 0.9 }, 'effort_01-a': { type: 'choice', choice: 'medium', confidence: 0.6 } },
    })));
    process.env.GPS_JEV_BASE_URL = `http://127.0.0.1:${server.address().port}`;
    const one = await classifyTickets([{ name: '01-a', body: 'Body' }]);
    assert.strictEqual(one['01-a'].model, family, raw);
    server.close();
  }

  // Non-2xx -> JevError.
  server = stubServer((_b, _req, res) => { res.statusCode = 500; res.end('oops'); });
  process.env.GPS_JEV_BASE_URL = `http://127.0.0.1:${server.address().port}`;
  await assert.rejects(classifyTickets([{ name: '01-a', body: 'x' }]), (err) => err instanceof JevError && /HTTP 500/.test(err.message));
  server.close();

  // Missing TYPESAFE_API_KEY -> JevError, no network call attempted.
  delete process.env.TYPESAFE_API_KEY;
  await assert.rejects(classifyTickets([{ name: '01-a', body: 'x' }]), (err) => err instanceof JevError && /TYPESAFE_API_KEY/.test(err.message));
  process.env.TYPESAFE_API_KEY = 'test-key';

  // Unknown model choice in the response -> JevError (not silently written).
  server = stubServer((_b, _req, res) => res.end(JSON.stringify({
    model: 'jev-1',
    answers: { 'model_01-a': { type: 'choice', choice: 'gpt-5', confidence: 0.5 }, 'effort_01-a': { type: 'choice', choice: 'low', confidence: 0.5 } },
  })));
  process.env.GPS_JEV_BASE_URL = `http://127.0.0.1:${server.address().port}`;
  await assert.rejects(classifyTickets([{ name: '01-a', body: 'x' }]), (err) => err instanceof JevError && /unknown model "gpt-5"/.test(err.message));
  server.close();

  // Timeout -> JevError (GPS_JEV_TIMEOUT_MS shrunk so the test stays fast).
  process.env.GPS_JEV_TIMEOUT_MS = '100';
  server = stubServer(() => { /* never responds */ });
  process.env.GPS_JEV_BASE_URL = `http://127.0.0.1:${server.address().port}`;
  await assert.rejects(classifyTickets([{ name: '01-a', body: 'x' }]), (err) => err instanceof JevError && /timed out/.test(err.message));
  server.close();
  delete process.env.GPS_JEV_TIMEOUT_MS;
  delete process.env.GPS_JEV_BASE_URL;

  console.log('jev.test.js: all assertions passed');
})();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lib/jev.test.js`
Expected: FAIL — `Cannot find module '../../skills/gps/scripts/lib/jev'`.

- [ ] **Step 3: Implement `skills/gps/scripts/lib/jev.js`**

Read `GPS_JEV_BASE_URL`/`GPS_JEV_TIMEOUT_MS` fresh on every call (a small `endpoint()`/`timeoutMs()` pair, or inline at the top of `classifyTickets` — mirror `lib/github.js`'s `ghCommand()`, which reads `process.env.GPS_GH_BIN` inside the function rather than caching it at module load, precisely so tests can change it between calls): `` `${process.env.GPS_JEV_BASE_URL || 'https://api.typesafe.ai'}/v1/systemone` `` and `Number(process.env.GPS_JEV_TIMEOUT_MS) || 15000`. `JEV_MODEL = 'jev-latest'` (this one has no override and can stay a module-level constant).

`MODEL_CRITERIA` (one short sentence each, from `references/plan.md`'s existing heuristic): `'haiku-5.5'` (small, clear, recurs often — renames, docs, config, one obvious-pattern file), `'sonnet-5'`/`'sonnet-5.5'` (ordinary multi-step implementation judgment; older/current Sonnet build), `'opus-5'`/`'opus-5.5'` (cross-file design judgment or genuinely tricky debugging; older/current Opus build). `EFFORT_CRITERIA`: `low` (the change is spelled out), `medium` (ordinary), `high` (subtle logic, or several files to keep consistent), `xhigh` (hard reasoning a mistake would be costly in). `FAMILY_BY_MODEL` maps every `MODEL_CRITERIA` key to `'haiku'`/`'sonnet'`/`'opus'` per the names.

Internal (not exported) `buildRequestBody(tickets)`: `{ state: { tickets: tickets.map(({name, body}) => ({name, body})) }, model: JEV_MODEL, questions }`, where for each ticket at index `i` it adds `questions['model_' + name]` and `questions['effort_' + name]`, each `{ type: 'choice', instructions: ..., criteria: MODEL_CRITERIA / EFFORT_CRITERIA }`, with `instructions` referencing `` `state.tickets[${i}].body` `` by backticked path (per Jev's own state-path convention).

Internal `parseAnswers(tickets, json)`: for each ticket, read `json.answers['model_' + name]` / `['effort_' + name]`; throw `JevError` when either is missing, when the model choice isn't a `FAMILY_BY_MODEL` key, or when the effort choice isn't an `EFFORT_CRITERIA` key; otherwise return `{ model: FAMILY_BY_MODEL[choice], modelRaw: choice, modelConfidence, effort: choice, effortConfidence }` per ticket.

`classifyTickets(tickets)`: throw `JevError('TYPESAFE_API_KEY is not set.')` up front if `!process.env.TYPESAFE_API_KEY`. Otherwise `AbortController`, `setTimeout(() => controller.abort(), TIMEOUT_MS)` (cleared in a `finally`), `fetch(ENDPOINT, { method: 'POST', headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify(buildRequestBody(tickets)), signal: controller.signal })`. Catch a thrown/rejected fetch and rethrow as `JevError` (message says "timed out after Ns" when `err.name === 'AbortError'`, else `err.message`). When `!response.ok`, throw `JevError('Jev request failed: HTTP ' + response.status)`. Otherwise `await response.json()` (wrap a parse failure in `JevError` too) and return `parseAnswers(tickets, json)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/lib/jev.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/gps/scripts/lib/jev.js tests/lib/jev.test.js
git commit -m "feat(gps): add the Jev HTTP client for ticket Model/Effort hints"
```

---

### Task 3: `jev.enabled` in `.work/gps-config.json`

**Files:**
- Modify: `skills/gps/scripts/lib/project-config.js`
- Test: `tests/lib/project-config.test.js`

**Interfaces:**
- Consumes: `diagnoseJev()` from Task 2 (`skills/gps/scripts/lib/jev.js`).
- Produces: `jevEnabled(projectRoot): boolean` and `rescanJevConfig(projectRoot, { apply, check } = {}): { status: 'created'|'unchanged'|'differs'|'updated', stored: boolean|null, storedAt: string|null, detected: { enabled, reason }, config }` — same shape and semantics as the existing `rescanProjectConfig`, but for the `jev` section. `ensureProjectConfig`/`createConfig`/`validate` now also seed/validate an optional `jev: { enabled: boolean, detected_at: string }` section (default `{ enabled: false }` when absent, same treatment as `changelog`/`release`). `readConfig`, `writeConfig`, `githubEnabled`, `rescanProjectConfig`, `changelogSettings`, `releaseSettings`, `saveVersionFiles` are unchanged.

- [ ] **Step 1: Write the failing tests**

In `tests/lib/project-config.test.js`, add `jevEnabled, rescanJevConfig` to the existing destructured `require('../../skills/gps/scripts/lib/project-config')` line, then add (using the file's own `makeProject`/`configFile`/`readFile` helpers already defined near the top — `makeProject(name)` with no `origin` argument makes a plain, non-git directory):

```js
// jev: optional section, absent -> false, validated, independently rescanned.
delete process.env.TYPESAFE_API_KEY;
const jevProject = makeProject('jev-plain');
assert.strictEqual(ensureProjectConfig(jevProject).jev.enabled, false);
assert.strictEqual(jevEnabled(jevProject), false);

// A config file written before this feature existed (no "jev" key at all).
fs.writeFileSync(configFile(jevProject), JSON.stringify({ version: 1, github: { enabled: false, detected_at: '2026-01-01T00:00:00.000Z' } }));
assert.strictEqual(jevEnabled(jevProject), false, 'missing jev key defaults to false, never throws');

process.env.TYPESAFE_API_KEY = 'k';
let jevResult = rescanJevConfig(jevProject, { check: true });
assert.deepStrictEqual(
  [jevResult.status, jevResult.stored, jevResult.storedAt, jevResult.detected],
  ['differs', false, null, { enabled: true, reason: 'TYPESAFE_API_KEY is set' }],
);

jevResult = rescanJevConfig(jevProject, { apply: true });
assert.strictEqual(jevResult.status, 'updated');
assert.strictEqual(readFile(jevProject).jev.enabled, true);
assert.strictEqual(readFile(jevProject).github.enabled, false, 'github section is untouched by a jev rescan');

// Hand-forced false sticks even though the env var is set.
fs.writeFileSync(configFile(jevProject), JSON.stringify({ ...readFile(jevProject), jev: { enabled: false } }));
assert.strictEqual(jevEnabled(jevProject), false);

// Invalid jev section is a readable error, like changelog/release.
fs.writeFileSync(configFile(jevProject), JSON.stringify({ version: 1, github: { enabled: false, detected_at: 'x' }, jev: { enabled: 'yes' } }));
assert.throws(() => ensureProjectConfig(jevProject), (err) => err instanceof GpsError && /"jev\.enabled" must be true or false/.test(err.message));
delete process.env.TYPESAFE_API_KEY;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lib/project-config.test.js`
Expected: FAIL — `jevEnabled is not a function` / `"jev.enabled" must be true or false` not thrown.

- [ ] **Step 3: Implement the `jev` section in `skills/gps/scripts/lib/project-config.js`**

Import `diagnoseJev` from `./jev`. In `validate()`, add: when `config.jev !== undefined`, require `isObject(config.jev) && typeof config.jev.enabled === 'boolean'`, else `throw invalid('"jev.enabled" must be true or false', filePath)`. In `createConfig(projectRoot, detectedGithub, detectedJev)`, add `jev: { enabled: detectedJev.enabled, detected_at: new Date().toISOString() }` to the written object; update its one call site in `ensureProjectConfig` to `createConfig(projectRoot, diagnoseGithub(projectRoot), diagnoseJev())`. Add `jevEnabled(projectRoot) { return Boolean(ensureProjectConfig(projectRoot).jev && ensureProjectConfig(projectRoot).jev.enabled); }` (read once into a local, don't call `ensureProjectConfig` twice). Add `rescanJevConfig`, body structurally identical to `rescanProjectConfig` but reading/writing `existing.jev`/`config.jev` and comparing against `diagnoseJev()` instead of `diagnoseGithub(projectRoot)`; its `!existing` branch creates the file via `createConfig(projectRoot, diagnoseGithub(projectRoot), detected)`. Export `jevEnabled` and `rescanJevConfig` alongside the existing names.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/lib/project-config.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/gps/scripts/lib/project-config.js tests/lib/project-config.test.js
git commit -m "feat(gps): add jev.enabled to gps-config.json"
```

---

### Task 4: Surface `jev.enabled` in `/gps config`

**Files:**
- Modify: `skills/gps/scripts/config.js`
- Test: `tests/config.test.js`

**Interfaces:**
- Consumes: `rescanJevConfig` from Task 3.
- Produces: no new exports (script only); `config.js --json` output gains a top-level `jev: { status, stored, storedAt, detected }` field (the existing `status`/`stored`/`storedAt`/`detected` top-level fields, which described GitHub only, become `github: { status, stored, storedAt, detected }` — a breaking rename of the `--json` shape; nothing else in the codebase reads `config.js --json`'s output, so this is safe here).

- [ ] **Step 1: Write the failing tests**

In `tests/config.test.js`, update the existing `data.status`/`data.detected` assertions to `data.github.status`/`data.github.detected`, and add:

```js
// jev.enabled shows up next to github.enabled, detected from the env var.
delete process.env.TYPESAFE_API_KEY;
res = h.ok(root, 'config.js', [], {});
assert.match(res.out, /jev\.enabled = false/);
assert.match(res.out, /Jev detected now: off \(TYPESAFE_API_KEY is not set\)/);

res = h.ok(root, 'config.js', ['--rescan', '--apply'], { TYPESAFE_API_KEY: 'k' });
assert.match(res.out, /Updated: jev\.enabled false → true/);
assert.strictEqual(stored().jev.enabled, true);

const data2 = h.json(root, 'config.js', [], { TYPESAFE_API_KEY: 'k' });
assert.deepStrictEqual(data2.jev.detected, { enabled: true, reason: 'TYPESAFE_API_KEY is set' });
```

(Place these after the existing GitHub assertions, before the "corrupt file" case at the end; adjust the two pre-existing `data.status`/`data.detected` lines earlier in the file to `data.github.status`/`data.github.detected`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/config.test.js`
Expected: FAIL — `data.github` is undefined / no match for `jev.enabled`.

- [ ] **Step 3: Implement the `jev` block in `skills/gps/scripts/config.js`**

Import `rescanJevConfig` alongside `rescanProjectConfig`. Run both: `const github = rescanProjectConfig(projectRoot, { apply: options.apply, check: !options.rescan });` and `const jev = rescanJevConfig(projectRoot, { apply: options.apply, check: !options.rescan });`. Nest the returned `data` as `{ github, jev, file, changelog, release }` (replacing the current flat `{ status, stored, storedAt, detected, file, changelog, release }`). Build the text output as two parallel blocks — reuse the existing per-flag line-building logic (created/unchanged/differs/updated phrasing) for `github` exactly as today, and write the equivalent lines for `jev` using `jev.enabled`/`Jev detected now: <on/off> (<reason>)` in place of `github.enabled`/`GitHub detected now: ...` (the "Applying turns GitHub off" Enterprise-specific caveat line has no `jev` equivalent — skip it there). Keep the existing `changelog`/`release` lines unchanged, appended after both blocks.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/config.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/gps/scripts/config.js tests/config.test.js
git commit -m "feat(gps): show jev.enabled in /gps config"
```

---

### Task 5: `jev-hints.js` script

**Files:**
- Create: `skills/gps/scripts/jev-hints.js`
- Test: `tests/jev-hints.test.js`

**Interfaces:**
- Consumes: `mainAsync` (Task 1, `lib/cli.js`), `classifyTickets`/`JevError` (Task 2, `lib/jev.js`), `jevEnabled` (Task 3, `lib/project-config.js`), `parsePayload` (existing, `lib/write-payload.js`: `parsePayload(text) -> { tickets: [{ name, fileName, body }], errors: string[], ... }`), `UsageError` (existing, `lib/guard.js`).
- Produces: CLI `jev-hints.js [--json]`, no positionals, ticket blocks read from stdin. `--json` data: `{ used: boolean, reason?: string, tickets: { [name]: { model, modelRaw, modelConfidence, effort, effortConfidence } } }`.

- [ ] **Step 1: Write the failing tests**

`tests/jev-hints.test.js` (spawns the real script via `h.run`, piping stdin — extend `helpers.run` if it doesn't already support a `stdin` option; if not, add one there first, passing it through to `spawnSync`'s `input` field):

```js
const assert = require('assert');
const h = require('./helpers');

const TICKETS = '--- ticket: 01-a ---\nDo A.\n\n--- ticket: 02-b ---\nDo B.\n';

// Not enabled: no warning, same shape as a failed call.
{
  const root = h.tempProject();
  const res = h.ok(root, 'jev-hints.js', ['--json'], { TYPESAFE_API_KEY: '' }, TICKETS);
  assert.deepStrictEqual(JSON.parse(res.out), { used: false, reason: 'jev.enabled is false', tickets: {} });
  assert.strictEqual(res.err, '');
}

// Bad stdin: invalid ticket name -> usage error, nothing attempted.
{
  const root = h.tempProject();
  const res = h.run(root, 'jev-hints.js', [], {}, '--- ticket: not valid ---\nx\n');
  h.assertFails(res, 2, /Invalid ticket name/);
}

// Enabled + a real call (stub server) -> used: true, formatted text.
{
  const root = h.tempProject();
  const http = require('http');
  const server = http.createServer((req, res2) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => res2.end(JSON.stringify({
      model: 'jev-1',
      answers: {
        'model_01-a': { type: 'choice', choice: 'sonnet-5.5', confidence: 0.8 },
        'effort_01-a': { type: 'choice', choice: 'high', confidence: 0.7 },
        'model_02-b': { type: 'choice', choice: 'haiku-5.5', confidence: 0.9 },
        'effort_02-b': { type: 'choice', choice: 'low', confidence: 0.6 },
      },
    })));
  });
  server.listen(0);
  const env = { TYPESAFE_API_KEY: 'k', GPS_JEV_BASE_URL: `http://127.0.0.1:${server.address().port}` };
  // jev.enabled must be true in gps-config.json for the script to try at all.
  h.json(root, 'config.js', ['--rescan', '--apply'], env);
  const res = h.ok(root, 'jev-hints.js', ['--json'], env, TICKETS);
  const data = JSON.parse(res.out);
  assert.strictEqual(data.used, true);
  assert.deepStrictEqual(data.tickets['01-a'], { model: 'sonnet', modelRaw: 'sonnet-5.5', modelConfidence: 0.8, effort: 'high', effortConfidence: 0.7 });
  const text = h.ok(root, 'jev-hints.js', [], env, TICKETS).out;
  assert.match(text, /01-a: Model sonnet \(sonnet-5\.5, confidence 0\.8\) · Effort high \(confidence 0\.7\)/);
  server.close();
}

// Enabled but the call fails -> one warning, same shape as "not enabled".
{
  const root = h.tempProject();
  const env = { TYPESAFE_API_KEY: 'k', GPS_JEV_BASE_URL: 'http://127.0.0.1:1' }; // nothing listens here
  h.json(root, 'config.js', ['--rescan', '--apply'], env);
  const res = h.ok(root, 'jev-hints.js', ['--json'], env, TICKETS);
  assert.deepStrictEqual(JSON.parse(res.out).used, false);
  assert.deepStrictEqual(JSON.parse(res.out).tickets, {});
  assert.match(res.err, /⚠️  Jev call failed/);
}

h.done('jev-hints.test.js');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/jev-hints.test.js`
Expected: FAIL — script does not exist (and/or `h.run` has no `stdin` parameter yet).

- [ ] **Step 3: Add stdin support to `tests/helpers.js`'s `run`, then implement `skills/gps/scripts/jev-hints.js`**

In `tests/helpers.js`, give `run`, `ok` and `json` a 5th `stdin = ''` parameter each, threading it through: `run(cwd, script, args = [], env = {}, stdin = '')` passes `input: stdin` in the `spawnSync` options object; `ok(cwd, script, args, env, stdin)` passes it to `run(...)`; `json(cwd, script, args, env, stdin)` passes it to `ok(...)`.

In `jev-hints.js`: read all of stdin synchronously (`fs.readFileSync(0, 'utf-8')`), call `parsePayload` on it; if `errors.length`, throw `new UsageError(errors.join(' '))`; if no tickets, throw `new UsageError('No tickets: pipe at least one "--- ticket: NN-<slug> ---" block via stdin.')`; if any ticket's `body.trim()` is empty, throw `new UsageError(\`Ticket "${name}" is empty.\`)`. Then, inside `mainAsync({ usage: 'jev-hints.js [--json]', async run({ projectRoot, warn }) { ... } })`: if `!jevEnabled(projectRoot)`, return `{ text: 'Jev is not enabled; use your own judgment for every ticket.', data: { used: false, reason: 'jev.enabled is false', tickets: {} } }`; otherwise `try { const result = await classifyTickets(tickets); return { text: <one line per ticket, in stdin order>: \`${name}: Model ${model} (${modelRaw}, confidence ${modelConfidence}) · Effort ${effort} (confidence ${effortConfidence})\`, data: { used: true, tickets: result } }; } catch (err) { warn(\`Jev call failed: ${err.message}\`); return { text: 'Jev call failed; use your own judgment for every ticket.', data: { used: false, reason: err.message, tickets: {} } }; }`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/jev-hints.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/gps/scripts/jev-hints.js tests/jev-hints.test.js tests/helpers.js
git commit -m "feat(gps): add jev-hints.js for ticket Model/Effort judging"
```

---

### Task 6: Wire `jev-hints.js` into `/gps plan`

**Files:**
- Modify: `skills/gps/SKILL.md`, `skills/gps/references/plan.md`
- Test: `tests/skill.test.js`

**Interfaces:**
- Consumes: `jev-hints.js` (Task 5) as a named script Claude invokes from `references/plan.md`.
- Produces: nothing new for later tasks; this is the last task.

- [ ] **Step 1: Write the failing test**

In `tests/skill.test.js`, change the `expected.plan` entry from `['write-prepare.js', 'plan.js']` to `['write-prepare.js', 'plan.js', 'jev-hints.js']`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/skill.test.js`
Expected: FAIL — `plan.md must run jev-hints.js` (and, until Step 3 also updates `SKILL.md`, the `allowed-tools`-vs-`scripts` deep-equal assertion also fails once `jev-hints.js` exists on disk from Task 5 but is missing from `SKILL.md`).

- [ ] **Step 3: Update `SKILL.md` and `references/plan.md`**

In `SKILL.md`'s `allowed-tools` frontmatter list, insert `  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/jev-hints.js *)` alphabetically between the `init.js` and `plan.js` lines.

Replace `references/plan.md`'s step 3 (and renumber the steps after it) with:

```
3. Draft each ticket's content at once with `writing-plans` (superpowers), working from the resume `plan.js` names: Acceptance Criteria, Files to Touch, a Verification Step command with its expected output, Notes (the fields `write-prepare.js`'s ticket block prints) — leave the Model/Effort lines for step 4. Missing `writing-plans`: draft them yourself and say once that `superpowers` gives a fuller planner. Make each ticket one independently committable change, ordered so every ticket builds on committed work.
4. Pipe every drafted ticket (one `--- ticket: NN-<slug> ---` block each) into `jev-hints.js` once, for the whole plan. For a ticket it judged (`used: true`): write `**Model:** <family>`, `**Model (Jev):** <raw> (confidence <n>)`, `**Effort:** <level>` from its output line. For every other ticket (not enabled, or that call failed — `jev-hints.js` only ever warns, never errors), decide both yourself:
   - Model: default to `haiku` whenever the ticket is small, clear and of a kind that recurs often in this plan (renames, docs, config, one file with an obvious pattern) — most mechanical tickets qualify. Reach for `sonnet` only once the ticket needs ordinary multi-step implementation judgment, `opus` only for cross-file design judgment or tricky debugging, and `inherit` only when genuinely unsure. See [docs/decisions/0004-model-hints-stay-family-level.md](../../../docs/decisions/0004-model-hints-stay-family-level.md) for the full breakdown.
   - Effort `low`: the change is spelled out; `medium`: ordinary; `high`: subtle logic or several files to keep consistent; `xhigh`: hard reasoning a mistake would be costly in; `inherit`: unsure. There is no `max`: a ticket that seems to need it should be split instead (`write-apply.js` refuses it).
5. Run `unslop` on each ticket (missing: skip it and say so), keeping every Model/Effort/Model (Jev) line through it.
6. Ask for approval of the tickets with `AskUserQuestion`. Once approved: `/gps ship` saves and implements them (`/gps write` only saves them; `/gps auto` runs on to finish).
```

(Keep the file's existing `# /gps plan`, `**When:**`, and `**Example:**` lines as they are; only steps 3 onward change. Confirm the resulting file is still ≤ 40 lines.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/skill.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/gps/SKILL.md skills/gps/references/plan.md tests/skill.test.js
git commit -m "feat(gps): wire jev-hints.js into /gps plan's ticket drafting"
```

---

### Task 7: Decision record and docs

**Files:**
- Create: `docs/decisions/0005-jev-model-effort-hints-stay-optional-and-family-level.md`
- Modify: `.claude/CLAUDE.md`

**Interfaces:** none (docs only; nothing else depends on this task).

- [ ] **Step 1: Write `docs/decisions/0005-jev-model-effort-hints-stay-optional-and-family-level.md`**

Follow the existing decision-record format (see `docs/decisions/0004-model-hints-stay-family-level.md` for structure: Context, Decision, Alternatives rejected, Consequences). Content: optional by design (`TYPESAFE_API_KEY` env var + `jev.enabled` config flag, mirrors `github.enabled`); Jev judges the 5 version-named criteria for nuance, but the ticket's `**Model:**` line always gets the collapsed family — decision 0004's `Agent`-tool constraint is unchanged by adding Jev; the raw answer is kept verbatim in `**Model (Jev):**` for audit only. Alternatives rejected (from the 2026-10-08 brainstorm): writing the raw version-pinned value to `**Model:**` directly (hits the `Agent` tool's family-alias-only `model` parameter, decision 0004); a 5×4 pinned-version-by-effort agent-file grid (contradicts the one-file-per-effort-level invariant `tests/skill.test.js` checks, and hardcodes first-party Anthropic model IDs that break Claude Code users on Bedrock/Vertex/Foundry, who need a provider-specific ID instead). Failure handling: any Jev failure warns once and falls back per-ticket to Claude's own judgment, never a hard error.

- [ ] **Step 2: Update `.claude/CLAUDE.md`**

In the `## Session files` paragraph, in the sentence `` Project-wide: `.work/gps-config.json` (`github.enabled`, read via `lib/project-config.js`, detected once, re-detected only by `/gps config --rescan`) ``, change `` `github.enabled` `` to `` `github.enabled` and `jev.enabled` ``.

- [ ] **Step 3: Commit**

```bash
git add docs/decisions/0005-jev-model-effort-hints-stay-optional-and-family-level.md .claude/CLAUDE.md
git commit -m "docs(gps): record the Jev model/effort hints decision"
```

---

## After all tasks

Run the full suite once more (`npm test`) and confirm `tests/skill.test.js`'s plugin-version/CHANGELOG checks still pass (they don't depend on this feature, but they run every time). This plan does not bump `package.json`'s version or touch `CHANGELOG.md` — that's `/gps release`'s job, not part of this implementation.
