# grill-plan-ship: repository review and improvement plan (22 Sep 2026)

## 1. Executive summary

- **Tests pass, but the tool is not yet safe to release.** All 9 unit-test suites pass and every script passes `node --check`. The shared libraries are small and easy to read.
- **Data loss on re-run (confirmed, release-blocking).** I reproduced this in throwaway projects:
  - Running `/gps start`, `/gps plan` or `/gps ticket` a second time silently overwrites work already written: the filled resume, the real plan, or a ticket's "Done" status.
  - `/gps finish` marks every phase `[x]` even when tickets are still pending.
- **Path escape (confirmed).** Feature names are not cleaned before being used as folder names, so `/gps start "x/../../../../escaped"` creates files outside the project.
- **Claude Code integration gap.** `SKILL.md` never tells Claude to run `start-session.js`, `plan.js` or `finish.js`, and `ticket.js` appears only inside the `/gps ship` section. Claude has to guess the handler path for the core commands.
- **Handoff/resume does not exist yet.** It is only a spec and a plan: none of the 8 planned tasks has been started. The spec also has a design flaw (git status is limited to the session folder, which misses the code changes it is meant to explain).
- **Token usage is often unavailable.** `mangleCwd` doesn't match how Claude Code names its transcript folders. Paths containing `.`, spaces or non-ASCII characters (including this very worktree, `.claude/worktrees/...`) never resolve.

## 2. Repository snapshot

- **Branch:** `worktree-handoff-resume`, HEAD `3ae27fa` (docs only). Node v25.6.1, Windows 11.
- **Tracked code:** 10 handlers in `scripts/` and 9 libraries in `scripts/lib/`, each library with its own test file. 4 templates, 3 specs and 2 plans.
- **`examples/` and `evals/`:** they exist on disk but are empty and not tracked by git. On a fresh clone they are absent.
- **Version:** 1.0.0 everywhere (`package.json`, `plugin.json`, `marketplace.json`), while `CLAUDE.md` says the project is at "MVP".
- **No CI:** no GitHub Actions, no issue templates, no `npm test` script.
- **`.gitignore`:** ignores `.work/`, so session folders are never committed in this repo.

## 3. Implemented versus planned functionality

| Command | Handler | Status |
|---|---|---|
| `/gps scout` | `scout-merge.js` + `lib/scout-ingest.js` | **Implemented.** Validation is partial (see F-008, F-009). |
| `/gps start` | `start-session.js` | Implemented. Unsafe on re-run and with unusual names (F-001, F-002). **Handler not referenced in `SKILL.md`.** |
| `/gps status` | `status.js` | Implemented and read-only. Its `gitLog` is always empty when `.work/` is gitignored (F-012). |
| `/gps write` | `write-target.js`, `mark-plan-written.js` | Implemented. |
| `/gps plan` | `plan.js` | Implemented. Destroys an existing plan on re-run (F-003). **Handler not referenced in `SKILL.md`.** |
| `/gps ticket` | `ticket.js` | Implemented. Resets "Done" on re-run and crashes before a plan exists (F-004, F-010). |
| `/gps ship` | `ticket-queue.js`, `token-usage.js` | Implemented as Claude-driven instructions. Treats the `[slug]` stub tickets as real tickets (F-006). |
| `/gps finish` | `finish.js` | Partial: no completion check and no archiving, although the docs promise both. **Handler not referenced in `SKILL.md`.** |
| `/gps handoff`, `/gps resume` | none | **Planned but missing.** `lib/git.js`, `lib/handoff.js`, `lib/resume.js`, `templates/handoff.md`, their tests, the `hasHandoff` status field and the docs are all absent. |
| Examples, evals, ADRs, archiving | none | Documentation only (`CLAUDE.md`, `README.md`). |

## 4. Current architecture

Every command follows the same pattern: `SKILL.md` gives Claude instructions → Claude runs a thin handler (`scripts/*.js`) → the handler calls pure-ish libraries (`scripts/lib/*`).

- All state lives in `.work/sessions/`:
  - `.current-session`: pointer to the active session
  - `.pending-seeds.json`: seeds from `/gps scout`
  - `scout-reports/`: saved scout reports
  - `<id>/.session-config.json`: per-session state
- "What phase are we in?" is worked out from file contents (unfilled `{{ }}` placeholders, `**Status:** ✅ Done` lines) rather than from the config file.
- `status.js` reuses `write-target` and `ticket-queue`, so there is **no duplicated phase logic**. That part is good.
- The config fields `status` and `phases_completed` are advisory only; nothing reads them to make decisions.

## 5. What is working well

- Libraries are small, have no dependencies, and have tests that run in temp folders (`status.test.js` builds its own throwaway git repo).
- Scout reports are copied byte-for-byte (`copyFileSync`), and `COPYFILE_EXCL` prevents overwriting (`scout-ingest.js:29`).
- Slugs are validated before anything is written (`scout-ingest.js:15-19`).
- Consuming a seed only touches the JSON file, never the report.
- Token usage degrades to `{available:false}` instead of throwing.
- `.gitignore` handling appends without rewriting the file and recognises `.scratch`, `/.scratch` and `.scratch/`.
- `/gps status` is genuinely read-only, and it shares the same state logic as `/gps write` and `/gps ship`.

## 6. Findings

**F-001 · Critical · Correctness · Confirmed issue: re-running `/gps start` overwrites an existing session**
- **Where:** `scripts/start-session.js:41-76`
- **What happens:** `mkdirSync(recursive)` succeeds when the folder already exists, and the handler then rewrites `resume.md`, `notes.md`, `INDEX.md` and the config. Reproduced: a filled resume was reverted to the template, and `created_at`, `phases_completed` and `usage` were reset.
- **Why it matters:** the whole brainstorm output is lost silently.
- **Fix:** if the session folder exists, stop with an error such as "Session exists, use `/gps resume` or pick another name". Alternatively add an explicit `--force`.
- **Test:** start twice, assert exit code ≠ 0 and the file content is unchanged.

**F-002 · High · Security · Confirmed issue: feature names are used as paths without sanitising**
- **Where:** `scripts/start-session.js:33`
- **What happens:** the slug is only lowercased with whitespace replaced by `-`. `/gps start "x/../../../../escaped"` created `…/Temp/escaped` outside the project, and `.current-session` stored the traversal string. The same name also becomes the scratch folder path (`scratch-dir.js:11`).
- **Impact:** the attacker is whoever types the feature name (the user, or an LLM-chosen name), so exploitability is low. Accidental damage is realistic, though: names containing `/`, `:` or `?` break on Windows.
- **Fix:** turn names into a slug with `[a-z0-9-]` only and reuse scout's `SLUG_RE`. Reject names that end up empty. Check that the resolved path stays under `sessionsDir`.
- **Test:** a table of bad names (`../x`, `a/b`, `a:b`, `""`, `"   "`).

**F-003 · Critical · Correctness · Confirmed issue: re-running `/gps plan` destroys the written plan**
- **Where:** `scripts/plan.js:58-69`
- **What happens:** it overwrites `plan.md` with the template and adds 4 new `NN-[slug].md` stubs next to the real tickets. Reproduced: the real `plan.md` was reverted, and `01-[slug].md` sat next to `01-a.md`.
- **Fix:** refuse if `plan.md` exists without placeholders, or if `plan` is in `phases_completed`.
- **Test:** plan → write → plan again, assert that the command is rejected and nothing changed.

**F-004 · Critical · Correctness · Confirmed issue: re-running `/gps ticket N` resets a finished ticket**
- **Where:** `scripts/ticket.js:64-67`
- **What happens:** `commit-log.md` is overwritten unconditionally. Reproduced: `done: true` became `done: false`, and the commit hashes and test output in the log were lost. `/gps ship` would then re-implement the ticket.
- **Fix:** only write the log if it doesn't exist yet. Print "already Done" if it is done.
- **Test:** ticket → mark Done → ticket again → still done.

**F-005 · High · Correctness · Confirmed issue: `/gps finish` doesn't check completion and doesn't archive**
- **Where:** `scripts/finish.js:27-54`; `SKILL.md:224-234`
- **What happens:** every phase is marked `[x]` with pending tickets (reproduced), and `INDEX.md` is overwritten. `.current-session` still points at the finished session, so later `/gps write` or `/gps ship` calls act on it. The "Archive" promise is not implemented.
- **Fix:**
  - Require all tickets to be done, or a bounded session (resume only), unless `--force` is given.
  - List the real tickets and their status in `INDEX.md`.
  - Clear or retarget `.current-session`.
  - Change the docs wording from "Archive" to "Summarise".

**F-006 · High · Correctness · Confirmed issue: `[slug]` stub tickets are treated as real tickets**
- **Where:** `scripts/lib/ticket-queue.js:24-42`; `scripts/ticket.js:29-38`
- **What happens:** stubs parse as tickets with slug `[slug]`. Because `[` sorts before letters, `ticket.js 1` picked `01-[slug].md` over `01-a.md` (reproduced) and created `03-implement/01-[slug]/`.
- **Fix:** have `parseTicketFilename` reject slugs that don't match `SLUG_RE`. Make `ticket.js`/`ticket-queue.js` refuse while `writeTarget ≠ none`. Report duplicate ticket numbers as an error.

**F-007 · High · Integration · Confirmed issue: `SKILL.md` never gives the handler command for start, plan or finish**
- **Where:** `skills/gps/SKILL.md:78-234` (grep: only scout-merge, status, write-target, mark-plan-written, ticket-queue, ticket and token-usage are referenced)
- **Why it matters:** Claude has to infer that `/gps start` means `node $CLAUDE_PLUGIN_ROOT/scripts/start-session.js`. It may create files by hand, skipping the config, pointer and scratch folder.
- **Fix:** give every command an explicit "Run: `node $CLAUDE_PLUGIN_ROOT/scripts/<x>.js …`" line, and add a rule: "never create session files by hand; if the handler fails, report its stderr".

**F-008 · High · Reliability · Confirmed issue: a malformed seeds file is silently wiped**
- **Where:** `scripts/lib/seeds-store.js:14-18, 26-31`
- **What happens:** a JSON parse error returns `{}`, and the next merge overwrites the file. Reproduced: `{bad` was replaced, and every pending seed was lost. `writeSeeds` is also not atomic.
- **Fix:** throw a clear error on bad JSON (or copy the file to `.pending-seeds.json.corrupt-<ts>` first). Write to a temp file and rename it into place.

**F-009 · Medium · Correctness · Confirmed issue: scout accepts duplicate slugs and incomplete candidates**
- **Where:** `scripts/lib/scout-ingest.js:15-47`
- **What happens:**
  - Duplicate slugs in one batch collapse silently to the last one (reproduced: 2 given → 1 seeded).
  - `strength`, `problem` and `solution` are not validated (a slug-only candidate is accepted).
  - The report is copied before seeds are merged, so a failed merge leaves an orphan report. That is harmless, but it isn't reported.
- **Fix:**
  - Reject duplicate slugs.
  - Require the fields, and check `strength` is one of `Strong`, `Worth exploring` or `Speculative`.
  - Validate everything before copying.
  - On a timestamp collision, add a suffix instead of failing with a raw `EEXIST` error.

**F-010 · Medium · UX/Reliability · Confirmed issue: raw stack traces instead of clear errors**
- **Where:**
  - `ticket.js:29` (no tickets folder → `ENOENT` stack, reproduced)
  - `finish.js`, `ticket.js`, `mark-plan-written.js`, `token-usage.js` (no `.work/sessions` → `ENOENT` from `readdirSync` in `session-store.js:12`, reproduced)
  - `scout-merge.js:36` (bad JSON → `SyntaxError` stack, reproduced)
  - Every handler that parses the config
- **Fix:** add a shared `resolveSessionOrExit()` plus a top-level try/catch that prints `❌ <message>` and a recovery hint.

**F-011 · Medium · Reliability · Confirmed issue: the current-session pointer isn't validated**
- **Where:** `scripts/lib/session-store.js:47-56`
- **What happens:** the pointer is accepted if the folder exists, even with no config and even with `..` in it. Reproduced: a pointer to `zzz` made `/gps write` crash. Falling back to "most recent session" silently switches the session with no warning.
- **Fix:** require a config file and a folder name that passes `SLUG_RE`. When falling back, say so in stderr and in the status JSON (`resolvedBy: "pointer" | "fallback"`).

**F-012 · Medium · Correctness · Confirmed issue: `gitLog` is usually empty**
- **Where:** `scripts/lib/status.js:29-41`; spec §`lib/git.js`
- **What happens:** the log is limited to the session folder. When `.work/` is gitignored (as in this repo) it is always `[]`, and even when tracked it only shows doc commits, not code commits. The handoff spec repeats this for `git status`, which would miss exactly the uncommitted code it is meant to explain.
- **Fix:** use commits since `created_at` (`git log --since`) plus a project-wide `git status --porcelain`.

**F-013 · Medium · Security · Confirmed by inspection (POSIX only): shell built from a string**
- **Where:** `scripts/lib/status.js:32`
- **What happens:** `execSync` builds `git log … -- "${relPath}"`. On macOS/Linux, `$()` or backticks in a session folder name would run inside the double quotes. Only the unsanitised feature name (F-002) can get them there.
- **Fix:** use `execFileSync('git', [...])`. The planned `lib/git.js` must do the same.

**F-014 · Medium · Correctness · Confirmed issue: `mangleCwd` doesn't match Claude Code's transcript folder names**
- **Where:** `scripts/lib/token-usage.js:16-18`
- **What happens:** only `:`, `\` and `/` are replaced. The real folders in `~/.claude/projects` show that `.`, spaces and non-ASCII characters also become `-`: for example `C--DEV-AICODE-grill-plan-ship--claude-worktrees-handoff-resume`, `…geant4-v11-4-1…` and `Universit--de-Namur`. Any such project silently reports "unavailable", including this worktree.
- **Fix:** replace `/[^A-Za-z0-9]/g` with `-`, and fall back to searching all project folders for `<sessionId>.jsonl`.
- **Caveat:** this transcript layout is an undocumented Claude Code internal. I also have not verified that `CLAUDE_CODE_SESSION_ID` is exported to the Bash tool, or that sub-agent transcripts are excluded (which would undercount usage during `/gps ship`).

**F-015 · Medium · Missing feature: `/gps handoff` and `/gps resume` are absent**
- **Where:** the files listed in `docs/superpowers/plans/2026-09-22-handoff-resume.md`, tasks 1–8. None exist.
- **Fix before implementing:**
  - Fix the git scope (F-012).
  - Store the machine fields in a JSON sidecar (`HANDOFF.json`) so drift checks don't have to parse the rendered Markdown.
  - Back up the previous `HANDOFF.md` before overwriting it.
  - Mark the narrative as "as of <timestamp>" in the resume output.

**F-016 · Medium · Integration · Documentation drift: external skill names may not resolve**
- **Where:** `SKILL.md:42-45, 57`; `package.json` `peerDependencies`
- **What happens:** in this environment, `mattpocock-skills` offers `codebase-design`, `grilling` and others, but **no `improve-codebase-architecture`**, and there is no `unslop` skill. `peerDependencies` holds names like `superpowers:brainstorming` that aren't valid npm package names, and it is not a real way to declare plugin dependencies.
- **Fix:** check against the current plugin versions. Document the required plugins in the README. Remove `peerDependencies`. In `SKILL.md`, add "if the skill is unavailable, stop and tell the user which plugin to install".

**F-017 · Low · Maintainability · Confirmed issue: the `status` field never moves forward**
- **Where:** `mark-plan-written.js:25`; `plan.js:73`
- **What happens:** `status` stays `plan-in-progress` for the whole implementation phase. Bounded sessions show `/gps plan` as the next step.
- **Fix:** set `status` in each handler (`implementing`, `completed`), or remove the field and compute it.

**F-018 · Low · Correctness · Confirmed issue: session date uses UTC**
- **Where:** `start-session.js:32`
- **What happens:** a session started late in the evening in Namur (UTC+2) is named with tomorrow's date.
- **Fix:** use the local date.

**F-019 · Low · Correctness · Recommendation: placeholder detection is fragile**
- **Where:** `write-target.js:5`
- **What happens:** a legitimate `{{ … }}` in Vue, Handlebars, Jinja or Go-template content keeps a phase "pending" forever, and `plan.js` refuses to run.
- **Fix:** only match the known template placeholders, or use HTML-comment markers like `<!-- gps:placeholder -->`.

**F-020 · Low · Reliability · Recommendation: config writes aren't atomic**
- **Where:** every `writeFileSync(configPath, …)`
- **Fix:** add a shared `writeJsonAtomic` (write to a temp file, then rename).

**F-021 · Low · Correctness · Confirmed issue: ticket numbers above 99 are handled wrongly**
- **Where:** `ticket-queue.js:26` (lexical sort) and `ticket.js:30` (`padStart(2)` combined with `startsWith`)
- **What happens:** `100-x` sorts before `99-x`, and `ticket 001` is not found.
- **Fix:** parse and sort numerically, and match on the parsed number.

**F-022 · Medium · UX · Documentation drift: the docs describe things that don't exist**
- `CLAUDE.md`: says "exactly 4 commands", uses the `YYYYMMDD__` date format and `2026-09-16__test-feature` examples, has an incomplete scripts list, and refers to `examples/`, `evals/` and archiving.
- `README.md`: has no scout, status or token/scratch recovery docs, uses `YYYYMMDD__` in `README.md:46-54`, and lists 3 examples that don't exist (`README.md:71-76`).
- `SKILL.md:173`: "Creates 4 ticket templates" leaks an implementation detail.
- Version `1.0.0` doesn't match the "MVP" status.

**F-023 · Low · Testing · Recommendation: there is no test runner or CI**
- Add `"test": "node --test scripts/lib"`, or a loop over the test files, plus a GitHub Actions matrix (ubuntu, macos, windows × Node LTS).

## 7. Testing results

- **Unit tests, run one by one:** all 9 suites pass (`scout-ingest`, `scratch-dir`, `seeds-store`, `session-store`, `status`, `templates`, `ticket-queue`, `token-usage`, `write-target`). `status.test` prints harmless LF/CRLF warnings from its temp repo.
- **Syntax check:** `node --check` passes on all 19 non-test scripts.
- **No `npm test`:** `package.json` defines no scripts.
- **Manual end-to-end checks (temp folders):** they confirmed F-001, F-002, F-003, F-004, F-005, F-006, F-008, F-009, F-010 and F-011.
- **Coverage gaps:**
  - Nothing tests the CLI handlers or their exit codes.
  - No end-to-end sequence (start → write → plan → write → ship → finish).
  - Nothing covers re-runs, bad input or corrupted state (bad JSON, stale pointer), duplicate seeds, report collisions, old sessions, the read-only guarantee of status (e.g. a before/after file hash), or cross-OS paths.
  - External skill failures can only be tested manually.

## 8. Prioritized improvement plan

**Milestone M1: stop data loss (blocks release)**

| ID | Title | Pri | Files | Deps | Acceptance | Effort |
|---|---|---|---|---|---|---|
| T-01 | Shared `lib/guard.js`: `slugify`/`assertSlug`, `resolveSessionOrExit`, `readJson` (clear error), `writeJsonAtomic`, `fail(msg, hint)` | P0 | new `scripts/lib/guard.js` + test | — | Every handler uses it; no raw stack traces | M |
| T-02 | `start`: sanitise the name, refuse an existing session | P0 | `start-session.js` | T-01 | F-001/F-002 repro cases exit 1 with nothing changed | S |
| T-03 | `plan`: refuse if a plan is already written | P0 | `plan.js` | T-01 | F-003 repro rejected | S |
| T-04 | `ticket`: don't overwrite the log; guard a missing plan or pending write | P0 | `ticket.js` | T-01 | F-004/F-010 repro pass | S |
| T-05 | Seeds: strict JSON parsing, atomic writes; stricter scout validation | P0 | `seeds-store.js`, `scout-ingest.js`, `scout-merge.js` | T-01 | F-008/F-009 repro rejected; the corrupt file is kept | S |
| T-06 | `finish`: completion check, real summary, clear the pointer | P1 | `finish.js`, `SKILL.md` | T-01 | Pending tickets → exit 1 unless `--force` | M |

**Milestone M2: integration and consistent state**

| ID | Title | Pri | Files | Deps | Acceptance | Effort |
|---|---|---|---|---|---|---|
| T-07 | Explicit handler lines for every command + a "never create files by hand" rule | P1 | `SKILL.md` | — | grep finds a `node $CLAUDE_PLUGIN_ROOT/scripts/…` line for all 8 commands | S |
| T-08 | Ticket queue ignores stubs, sorts numerically, reports duplicates | P1 | `ticket-queue.js`, `ticket.js` | — | F-006/F-021 tests | S |
| T-09 | Pointer validation + `resolvedBy` field | P1 | `session-store.js`, `status.js` | T-01 | F-011 test | S |
| T-10 | `lib/git.js` via `execFileSync`; commits since `created_at` + project-wide status | P1 | new `lib/git.js`, `status.js` | — | Works with `.work` ignored; no shell | M |
| T-11 | Status field progression / computed status; bounded-session awareness | P2 | handlers, `status.js` | — | Status matches the real phase in the end-to-end test | S |
| T-12 | Fix `mangleCwd` + fallback search | P2 | `token-usage.js` | — | Tests for paths containing `.`, spaces and accents | S |

**Milestone M3: tests and CI**

| ID | Title | Pri | Deps | Acceptance | Effort |
|---|---|---|---|---|---|
| T-13 | `npm test` + a CLI test harness (spawn a handler in a temp folder, check exit code, stdout and files) | P1 | M1 | Every handler has success and failure cases | M |
| T-14 | End-to-end sequence test + read-only hash test for status | P1 | T-13 | Passes on all three OSes | M |
| T-15 | GitHub Actions matrix | P2 | T-13 | Green on ubuntu, macos and windows | S |

**Milestone M4: handoff/resume** (T-16: rewrite the spec for the git scope and a JSON sidecar, then carry out plan tasks 1–8. Effort: L, deps: T-10 and T-13.)

**Milestone M5: docs and release** (T-17: fix the drift in F-022 and F-016. T-18: one real example session. T-19: version 0.x → 1.0.0 with a CHANGELOG. Effort: M.)

## 9. Documentation and UX improvements

- **Every error should say three things:** what failed, why, and the next command to run, e.g. "❌ Plan already written for X. To redo it, delete 02-plan/ or run /gps status."
- **Every success should list what changed:** files created, files modified, files left untouched.
- **README:** add scout, status, and handoff/resume once it ships. Add a "Recovering from interrupted work" section (pointer, `/gps status`, re-running rules) and a table of required plugins. Remove the examples section, or add a real example.
- **`/gps status`:** have `status.js` output a computed `suggestedNext` field so Claude doesn't have to work it out.
- **`CLAUDE.md`:** rewrite to reflect the current tree, command list and date format.

## 10. Roadmap alignment

- `CLAUDE.md`'s MVP items ("test handlers with a real session", "polish error messages") are exactly where the confirmed bugs are, so they are still the right priorities.
- ADR generation, archiving to `docs/archive/`, batch operations and GitHub Issues should stay deferred.
- Handoff/resume is reasonable scope for v1.0, but only after M1–M3 are done.

## 11. Suggested milestones

- **MVP hardening (release-blocking):** M1 plus T-07, T-08, T-09 and T-13. Set the version to 0.9.0.
- **v1.0:** M2 (rest), M3, M4 and M5. Tag 1.0.0.

## 12. Open questions and assumptions

- **Unverified: the external skill names.** I only checked the plugins installed on this machine. Is `improve-codebase-architecture` renamed or gone upstream? Which plugin provides `unslop`?
- **Unverified: token tracking.** I did not verify that `CLAUDE_CODE_SESSION_ID` is exported to Bash tool calls, or which transcript files hold sub-agent usage.
- **Assumption:** `.work/` is meant to be gitignored in user projects. If sessions are meant to be committed, the plugin should say so, and F-012 becomes less severe.
- **Linux/macOS:** I tested on Windows only. The shell-injection finding (F-013) is based on reading the code.

---

**Five improvements to do first:** T-02 (start guard and cleaning names), T-04 (ticket log overwrite), T-03 (plan guard), T-05 (seeds corruption), T-07 (handler lines in `SKILL.md`).

**Should stay deferred:** ADR automation, archiving, batch tickets, GitHub Issues, automatic seed expiry.

**Issues that should block a release:** F-001, F-002, F-003, F-004, F-005, F-006, F-007, F-008.

**Post-implementation validation checklist:**
- [ ] `npm test` is green locally and on the CI matrix (3 OSes).
- [ ] All reproductions above now exit 1 with no files changed: re-run start/plan/ticket, traversal name, corrupt seeds, stale pointer, no `.work` folder.
- [ ] End-to-end run: start → write → plan → write → ship (2 tickets) → finish, with correct `INDEX.md` and status at each step.
- [ ] Hash of `.work/` before and after `/gps status` (and `/gps resume`) is identical.
- [ ] Token usage is available in a path containing dots or spaces.
- [ ] Every `SKILL.md` command maps to an existing script; README, CLAUDE.md and SKILL.md agree on the command list and date format.
- [ ] Marketplace install from a clean clone works: `/plugin marketplace add` → `/plugin install` → `/gps start demo`.
