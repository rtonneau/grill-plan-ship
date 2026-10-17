# Codex Windows Sandbox Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make GPS state and release-file updates work inside a Windows Codex workspace sandbox and stop GPS startup from redundantly shell-loading globally injected repository instructions.

**Architecture:** Add one content-replacement helper in `guard.js`: use the existing sibling-temp/rename path first, but on replacement-denied `EPERM` or `EACCES`, overwrite the destination directly and clean the temp file. Route every existing hand-written temp/rename writer through it, then harden the GPS router and Codex setup guide around host-owned `AGENTS.md` loading.

**Tech Stack:** Node.js 20+ built-ins, CommonJS, `node:assert`, Markdown skill/router documentation

**Spec:** `docs/superpowers/specs/2026-10-17-codex-windows-sandbox-compatibility-design.md`

## Global Constraints

- Support Node.js 20+ on Windows and retain dependency-free CommonJS code.
- Keep temporary-file-plus-rename as the normal write path.
- Preserve each caller's exact serialization and trailing-newline behavior.
- Do not bypass or weaken the Codex sandbox.
- Keep `skills/gps/SKILL.md` below 100 lines and reference files at or below 40 lines.

## Review Focus

- A denied rename when the destination already exists must update it and remove the sibling temp file; Task 1 tests `EPERM` on overwrite.
- A denied rename when the destination does not yet exist must still create it without residue; Task 1 tests first-write fallback.
- An unrelated rename error must not be converted into apparent success; Task 1 tests error propagation and cleanup.
- Changelog and release writers must not retain private temp/rename implementations; Task 2 tests source-level centralization plus their existing behavioral suites.
- Codex must not interpret “read the skill” as “reload repository instructions”; Task 3 pins the router wording and documents the global `~/.codex/AGENTS.md` import discovered in the captured session.

---

### Task 1: Sandbox-compatible shared replacement primitive

**Files:**
- Modify: `skills/gps/scripts/lib/guard.js`
- Modify: `tests/lib/guard.test.js`

**Interfaces:**
- Produces: `replaceFile(filePath: string, content: string, io: object = fs) -> void`; `writeJsonAtomic(filePath: string, data: unknown, io: object = fs) -> void` delegates serialization to it.

- [ ] **Step 1: Write failing tests for normal replacement and permission-denied fallback**

Extend `tests/lib/guard.test.js` with a minimal injected filesystem wrapper whose `renameSync` throws an error with `code = 'EPERM'` or `'EACCES'`. Assert that `replaceFile` updates an existing file, creates a missing file, preserves the exact supplied bytes, and leaves no filename containing `.tmp-`.

- [ ] **Step 2: Run the focused test and verify the new interface is absent**

Run: `node tests/lib/guard.test.js`

Expected: FAIL because `replaceFile` is not exported.

- [ ] **Step 3: Implement `replaceFile` and delegate `writeJsonAtomic` to it**

Write a uniquely named sibling temp file, attempt `renameSync`, and only for `EPERM`/`EACCES` write the already-serialized content directly to `filePath`. Use `finally` cleanup guarded by `existsSync`; rethrow all other errors. Keep `writeJsonAtomic` output as two-space JSON without a trailing newline.

- [ ] **Step 4: Add the non-permission failure regression**

Inject `renameSync` throwing `{ code: 'EIO' }`; assert the same error escapes, the previous destination content remains unchanged, and the temp file is removed.

- [ ] **Step 5: Run the focused test**

Run: `node tests/lib/guard.test.js`

Expected: PASS with `guard.test.js: all assertions passed`.

- [ ] **Step 6: Commit**

```bash
git add skills/gps/scripts/lib/guard.js tests/lib/guard.test.js
git commit -m "fix: support sandboxed Windows state replacement"
```

### Task 2: Centralize all overwrite-by-rename callers

**Files:**
- Modify: `skills/gps/scripts/lib/changelog-fragments.js`
- Modify: `skills/gps/scripts/lib/version-files.js`
- Modify: `tests/lib/changelog-fragments.test.js`
- Modify: `tests/lib/version-files.test.js`

**Interfaces:**
- Consumes: Task 1 `replaceFile(filePath, content, io)`.
- Produces: unchanged `writeFragment(projectRoot, sessionId, fragment) -> string` and `writeVersion(projectRoot, file, version) -> void` behavior, now sharing the sandbox fallback.

- [ ] **Step 1: Add a centralization regression**

In each owning test, read its implementation source and assert it imports/calls `replaceFile` and contains no `renameSync` or private `.tmp-${process.pid}` construction. Retain the existing content assertions as the behavioral contract.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `node tests/lib/changelog-fragments.test.js`

Run: `node tests/lib/version-files.test.js`

Expected: FAIL because both modules still implement replacement locally.

- [ ] **Step 3: Replace both local implementations with the shared helper**

Import `replaceFile` from `guard.js`; pass `serializeFragment(fragment)` unchanged in `writeFragment`, and keep `writeJsonFile` plus TOML/CMake replacements using their current strings so newline behavior does not change.

- [ ] **Step 4: Run focused state and release tests**

Run: `node tests/lib/changelog-fragments.test.js`

Run: `node tests/lib/version-files.test.js`

Run: `node tests/ticket-start.test.js`

Expected: all PASS, including overwriting `.session-config.json` during `ticket-start.js`.

- [ ] **Step 5: Commit**

```bash
git add skills/gps/scripts/lib/changelog-fragments.js skills/gps/scripts/lib/version-files.js tests/lib/changelog-fragments.test.js tests/lib/version-files.test.js
git commit -m "refactor: share sandbox-compatible file replacement"
```

### Task 3: Codex instruction-loading guardrail and verification guidance

**Files:**
- Modify: `skills/gps/SKILL.md`
- Modify: `docs/CODEX-SETUP.md`
- Modify: `docs/CODEX-SMOKE-TEST.md`
- Modify: `tests/skill.test.js`

**Interfaces:**
- Produces: a router rule that distinguishes GPS-owned skill/reference loading from host-owned repository instruction loading; a reproducible Windows Codex smoke check for the fixed write path.

- [ ] **Step 1: Write the failing router assertions**

In `tests/skill.test.js`, assert that the router says Codex-provided repository/global instructions are already loaded, prohibits shell re-reading `AGENTS.md` and expanding its `@...` imports, and still requires reading the selected GPS reference from the loaded skill directory.

- [ ] **Step 2: Run the focused test and verify the rule is missing**

Run: `node tests/skill.test.js`

Expected: FAIL on the new Codex instruction-loading assertion.

- [ ] **Step 3: Add the concise router rule**

Add the rule beside “How to run a command”: when Codex has supplied repository/global instructions in context, do not use PowerShell or another shell to reload `AGENTS.md` or resolve `@...`; load only GPS's own `SKILL.md`/selected reference by its installed absolute path. Do not weaken the existing requirement to read the command reference every time.

- [ ] **Step 4: Document diagnosis and a live smoke case**

In `docs/CODEX-SETUP.md`, explain that `~/.codex/AGENTS.md` is global, that Codex's Claude-import migration can place `@~/dotfiles/claude/COMMON_CLAUDE.md` there, and that host expansion is independent of the target cwd. Record the captured failure signature accurately: the absolute path was correct, the sandboxed manual `Get-Content` received `Access is denied` plus a secondary `PathNotFound`, and UI truncation was not path construction. In `docs/CODEX-SMOKE-TEST.md`, add a Windows workspace-write case that starts a disposable session, saves a one-ticket plan, runs `ticket-start.js --mode subagent+inline`, verifies valid config/no temp residue, and records client/version plus PASS/FAIL rather than claiming unrun coverage.

- [ ] **Step 5: Run documentation and size checks**

Run: `node tests/skill.test.js`

Run: `node tests/check-skill-size.js --max 200`

Expected: PASS; `SKILL.md` remains below its stricter 100-line test limit.

- [ ] **Step 6: Commit**

```bash
git add skills/gps/SKILL.md docs/CODEX-SETUP.md docs/CODEX-SMOKE-TEST.md tests/skill.test.js
git commit -m "docs: harden Codex instruction startup"
```

### Task 4: Whole-plugin regression verification

**Files:**
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: a release-note entry and full evidence that the shared write path did not regress other commands.

- [ ] **Step 1: Add the Unreleased fix note**

Under the existing Unreleased section, record Windows Codex sandbox-compatible file replacement and the startup instruction-loading guardrail without claiming desktop/live coverage that was not run.

- [ ] **Step 2: Check changed JavaScript syntax**

Run: `node --check skills/gps/scripts/lib/guard.js`

Run: `node --check skills/gps/scripts/lib/changelog-fragments.js`

Run: `node --check skills/gps/scripts/lib/version-files.js`

Expected: all exit 0 with no output.

- [ ] **Step 3: Run the full suite**

Run: `npm test`

Expected: exit 0 and every test file reports success.

- [ ] **Step 4: Inspect the final diff**

Run: `git diff --check`

Run: `git diff --stat`

Expected: no whitespace errors; changes are limited to the files named by this plan and its spec/plan documents.

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md docs/superpowers/specs/2026-10-17-codex-windows-sandbox-compatibility-design.md docs/superpowers/plans/2026-10-17-codex-windows-sandbox-compatibility.md
git commit -m "docs: plan Codex Windows sandbox compatibility"
```
