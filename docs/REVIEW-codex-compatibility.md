# Claude Code and Codex compatibility review

Date: 2026-10-12

Status: deterministic fixes implemented and verified on 2026-10-12; Windows CLI installation/discovery passed. Desktop and session-based live checks remain outstanding. Findings and original validation below describe the pre-implementation review; current results are in [CODEX-SMOKE-TEST.md](CODEX-SMOKE-TEST.md).

## Verdict and scope

The current working tree is designed for both Claude Code and Codex. The Codex port is substantial, but partially integrated rather than fully validated end to end.

This review includes the uncommitted working-tree changes present at review time, including the portable manifest and host dispatch adapter. It does not establish that those changes are available in a published release.

The architecture supports both hosts through shared dependency-free Node.js scripts, shared `.work/` session state, `$gps` routing, absolute script paths, and separate Claude/Codex delegation payloads. The root `plugin.json` follows the current portable format; a separate `.codex-plugin/plugin.json` is optional under the [official packaging documentation](https://developers.openai.com/plugins/build/plugins).

## Findings and correction hints

### 1. [P2] Codex can silently change inherited reasoning effort

**Evidence:** [host-dispatch.js](../skills/gps/scripts/lib/host-dispatch.js), particularly the conditional `model` and `reasoning_effort` fields; [ticket-model.js](../skills/gps/scripts/lib/ticket-model.js), which defines `inherit` as the session's own effort.

When a ticket selects a mapped model but specifies `inherit` for effort, the adapter emits an explicit model and omits `reasoning_effort`. Codex can then use the selected model's default effort instead of the parent session's effort. See the [official inheritance rules](https://learn.chatgpt.com/docs/agent-configuration/subagents).

**Chosen correction:** for an explicitly selected Codex model, resolve and explicitly pass the known parent effort after validating support. If the parent effort is unknown, require an explicit effort choice. Do not reinterpret `inherit` as `model-default`. Test the effective dispatch fields, not just omission of a field.

### 2. [P2] Deterministic delegation validation happens too late

**Evidence:** [ship.md](../skills/gps/references/ship.md), [ticket-start.js](../skills/gps/scripts/ticket-start.js), [dispatch-prompt.js](../skills/gps/scripts/dispatch-prompt.js), and [project-config.js](../skills/gps/scripts/lib/project-config.js).

The prescribed loop starts a ticket before generating its dispatch call. Missing mappings or unsupported efforts can therefore stop execution after the implementation directory, commit log, and `ticket_started` event exist. The ship instructions ask the agent to recognize configuration problems earlier, but there is no deterministic queue preflight. Fresh project configurations contain no Codex mappings, while planning normally produces named model hints.

**Correction:** add a read-only preflight for the entire queue before starting any ticket. Surface missing mappings and unsupported efforts during configuration or planning, especially for `$gps auto --delegate`. Preserve the existing rule against silently dropping overrides or substituting models.

### 3. [P2] Codex installation instructions are incomplete

**Evidence:** the Codex installation section in [README.md](../README.md).

The section says to install the plugin without explaining how to register its source, install it, or verify skill discovery. The locally inspected Codex CLI, version `0.162.1`, exposes `codex plugin marketplace add` and `codex plugin add`, but this review did not exercise installation.

**Correction:** document a tested installation route for supported Codex clients, any minimum version, and a `$gps help` smoke check. Include the required marketplace wiring or another supported installation mechanism. Do not present an untested command sequence as verified.

### 4. [P2] Tests establish adapter output, not actual Codex integration

**Evidence:** [host-dispatch.test.js](../tests/lib/host-dispatch.test.js), [dispatch-prompt.test.js](../tests/dispatch-prompt.test.js), and [skill.test.js](../tests/skill.test.js).

The adapter tests check generated objects using placeholder model IDs. The packaging checks verify manifest fields and file presence, but do not load the plugin into Codex. These tests establish useful deterministic behavior without proving installation, skill discovery, or execution of the emitted spawn call in a supported client.

**Correction:** add a documented integration test covering installation, skill discovery, inline execution, one delegated ticket, and resuming the same session across hosts. Keep this separate from the deterministic unit tests and record the tested client versions. Include failure cases for unavailable models, unsupported effort, and unavailable delegation tools.

### 5. [P3] Shared instructions still contain Claude-specific assumptions

**Evidence:** [start.md](../skills/gps/references/start.md), the host translation instructions in [SKILL.md](../skills/gps/SKILL.md), and the command-preapproval claim in [README.md](../README.md).

The start reference mandates `AskUserQuestion` and Claude-specific batching rules. The router tells Codex to translate that interface, but the reference remains contradictory. The README also presents Claude's `allowed-tools` rules as general permission preapproval, although Codex uses its own sandbox and approval policy.

**Correction:** make question handling explicitly host-dependent, respect the available tool's schema, and provide a conversational fallback when no suitable question tool exists. Scope the `allowed-tools` preapproval claim to Claude Code and explain Codex permissions separately.

## Additional finding affecting both hosts

### [P1] Privacy documentation omits the optional TypeSafe transmission

**Evidence:** [PRIVACY.md](../PRIVACY.md), [jev.js](../skills/gps/scripts/lib/jev.js), [jev-hints.js](../skills/gps/scripts/jev-hints.js), and initial configuration in [project-config.js](../skills/gps/scripts/lib/project-config.js).

The privacy policy denies third-party data transmission and says only Git/GitHub data leaves the machine. When Jev is enabled and credentials are available, the implementation sends ticket names and bodies to `https://api.typesafe.ai/v1/systemone`. Initial configuration can enable the integration based on the presence of `TYPESAFE_API_KEY`.

**Chosen correction:** update the privacy policy and README to disclose the service, transmitted payload, activation behavior, and opt-out. Also replace the Claude-only conversation-policy statement with wording that accounts for the selected host. Keep the existing activation behavior; adding an explicit opt-in or migrating existing settings is outside this work.

## Original review validation and limitations

- `npm test`: all 60 test files passed; no failures, skips, or cancellations.
- `node tests/check-skill-size.js --max 200`: passed; the GPS skill contains 76 lines.
- Inspected local Codex CLI version and plugin command help.
- Checked current official OpenAI documentation for plugin packaging and subagent inheritance.
- No live plugin installation or delegated Codex execution was performed.
- No implementation files were changed during the review.

Passing the deterministic suite supports the shared-core implementation. Full cross-host compatibility remains unverified until the installation and runtime integration checks above are completed.

## Implementation handoff

### Owner decisions, confirmed 2026-10-12

| Question | Decision | Consequence |
|---|---|---|
| Explicit Codex model with effort `inherit` | Preserve parent effort when known; require an explicit effort when unknown | Add a runtime input for parent effort; never guess it from a model name or supported-efforts list |
| Jev activation | Keep current behavior; correct documentation | No consent migration, new configuration flag, or change to key-based detection |
| Supported Codex clients for this work | CLI and desktop on Windows | Test both surfaces; do not claim macOS, Linux, IDE, or ChatGPT web support based on these results |

No product decision remains open. Account access, the actual desktop installation route, available models, and live permission behavior still require evidence during the manual verification ticket. If an environment prevents a check, record it as blocked or not run; do not fabricate a pass or ask the owner to choose technical facts that can be inspected.

### Scope and constraints

- Work from the existing working tree. It already contains uncommitted implementation changes; inspect `git status --short` and preserve them. Do not reset, discard, or reimplement the port from scratch.
- Implement the tickets below in order. T01 and T02 are independent; T04 depends on T03; T06 depends on T03 and T04; T07 verifies the completed changes.
- Keep CommonJS, Node.js 20+, two-space indentation, single quotes, and zero runtime dependencies.
- Preserve `.work/` formats, ticket aliases `haiku|sonnet|opus|inherit`, and explicit ticket efforts `low|medium|high|xhigh|inherit`. Do not add `max`, `ultra`, or provider-specific model IDs to ticket files.
- Preserve Claude dispatch payloads, effort agent definitions, the default `--host claude` on `dispatch-prompt.js`, and existing completion/review behavior.
- Preserve sequential execution: one ticket implementer at a time, no additional agent fan-out. This document does not request parallel implementation agents.
- Preserve the CLI contract: `--help`, success JSON on stdout with `--json`, warnings/errors on stderr, exit 0 success, 1 validation/precondition failure, 2 usage error. Existing failure output is textual even with `--json`; do not redesign the shared CLI.
- Do not store parent runtime effort, account credentials, or a cached list of available account models in committed session state. Project mappings describe preferences and declared support, not proof of account access.
- No version bump, release, publication, remote push, or change to Git/GitHub workflow semantics is part of these fixes.
- These are implementation tickets in a report, not GPS session state. Do not create `.work/` sessions merely to edit this document.

### Code map and existing test helpers

All script paths below are relative to `skills/gps/scripts/`; test commands run from the repository root.

| Responsibility | Existing entry point | Reuse guidance |
|---|---|---|
| Host payload construction | `lib/host-dispatch.js`: `buildDispatch` | Centralize Codex hint resolution here so preflight and dispatch cannot disagree |
| Ticket prompt and CLI overrides | `dispatch-prompt.js` | Keep the current complete brief and DONE/READY/BLOCKED contracts |
| Read current session | `lib/session-store.js`: `resolveSession` | Read-only; do not use session creation helpers in preflight |
| Get saved ticket queue | `lib/ticket-lookup.js`: `readyTickets` | Returns tickets after checking that the plan is saved; filter `!ticket.done` |
| Read project mappings | `lib/project-config.js`: `readConfig` | Returns null when missing; use `readConfig(root) || {}`, not `ensureProjectConfig`, in preflight |
| CLI argument parsing | `lib/cli.js`: `main`, `parseArgs` | `list` options already support repeated flags; errors use `GpsError`/`UsageError` |
| Test projects and sessions | `tests/helpers.js` | `gitProject`, `shipReady`, `completeTicket`, `run`, `json`, `assertFails`, `history` |
| Stub external calls | `tests/fixtures/fake-fetch.js`, existing GitHub test stubs | Never call TypeSafe or publish to GitHub from automated tests |

Important structural checks in `tests/skill.test.js`: every script and helper needs its matching test file; every script must be referenced by the skill or a command reference; `allowed-tools` lists every top-level script exactly once in alphabetical order. The router is under 100 lines and each command reference at most 40 lines. Keep detailed guidance in `docs/` and concise operational rules in the skill. Do not relax these checks to fit new prose.

### T01 — Correct privacy and host permission documentation

**Files:** `PRIVACY.md`, `README.md`. No runtime changes.

**Implementation:**

1. Replace the statements that no third party receives data and that only Git/GitHub traffic leaves the machine. Retain the accurate claims about no plugin-owned server and no analytics.
2. Describe the optional Jev request to `https://api.typesafe.ai/v1/systemone`: drafted ticket names and complete bodies plus classification instructions; `TYPESAFE_API_KEY` authenticates the request. State that arbitrary repository files are not uploaded by this code, while ticket bodies may contain project details or code included during drafting.
3. Explain that initial project configuration derives `jev.enabled` from key presence, subsequent calls consult the saved flag and key, and a rescan can propose changing the saved flag. Disabling `jev.enabled` stops Jev calls; an applied rescan can enable it again if the key is present.
4. Keep detection, rescan, fallback, and network code unchanged. Do not invent TypeSafe retention or training guarantees.
5. Make host conversation policies depend on whether the user is running Claude Code or Codex. Scope `Bash(...)`/`allowed-tools` preapproval to Claude Code; explain that Codex still applies its configured sandbox and approval rules.

**Acceptance:** the README and privacy policy agree with the actual Jev path, mention activation and opt-out, and make no promise that a Codex skill bypasses permissions. No code or config migration changes.

**Verification:** manually compare the edited claims with `lib/jev.js`, `jev-hints.js`, `lib/project-config.js`, and `config.js`. No new prose-matching tests are needed for this documentation-only ticket.

### T02 — Make question instructions portable

**Files:** `skills/gps/SKILL.md`, `skills/gps/references/*.md` where question rules occur, `tests/skill.test.js`.

**Implementation:** put the host rule in the router and replace unconditional `AskUserQuestion` requirements in shared references with a reference to that rule. In Claude Code retain the existing question tool and its supported batching. In Codex inspect the available question tool and its schema; do not assume the Claude tool name, four-question batches, or availability in every mode. When no suitable tool is available, ask concise numbered questions in the conversation and wait for answers to required decisions. An asynchronous request is not itself an answer. Never treat a preselected option or elapsed time as confirmation.

Keep the substantive approval gates (design approval, delete, session switch, release push) and already authorized auto-run behavior unchanged. Do not add repeated permission requests. A question tool cannot replace a sandbox escalation mechanism.

**Acceptance:** shared references no longer impose a Claude-only interface on Codex; the fallback works without a question tool; existing workflow decisions remain required where applicable. Update the old `tests/skill.test.js` assertion that specifically requires unconditional `AskUserQuestion` in `start.md` to assert the host-aware rule instead.

**Verification:** `node --test tests/skill.test.js` and `node tests/check-skill-size.js --max 200`, both exit 0. Manually inspect `start`, `plan`, `ship`, `auto`, `clean`, `config`, `finish`, `init`, `release`, and `status` references for contradictory instructions.

### T03 — Resolve Codex inherited effort explicitly

**Files:** `lib/host-dispatch.js`, `dispatch-prompt.js`, `tests/lib/host-dispatch.test.js`, `tests/dispatch-prompt.test.js`, `README.md`, `docs/decisions/0006-shared-core-with-host-dispatch-adapters.md`.

**Concrete interface:** add optional `--parent-effort <low|medium|high|xhigh>` to `dispatch-prompt.js`, and optional `parentEffort` to the brief passed to `buildDispatch`. Add and export a pure `resolveCodexHints({ model, effort, parentEffort }, config = {})` from `lib/host-dispatch.js`. It returns just the model/effort override fields for the Codex call. `buildDispatch` uses that resolver; T04 reuses it. Keep the `buildDispatch` signature backward compatible for callers without `parentEffort`.

`parentEffort` is a value supplied by the host agent from authoritative current runtime context. It is not discovered by the Node script. A supported-efforts list, model ID, previous ticket, or remembered user setting is not evidence of the current effort. Do not read private transcripts or scrape the user's Codex configuration to guess a runtime override. If the actual effort is unknown or outside the four representable levels, ask the user to choose a supported explicit ticket effort instead.

| Ticket model | Ticket effort | Required behavior |
|---|---|---|
| `inherit` | `inherit` | Keep native inheritance: omit both overrides; require no mapping or parent-effort input |
| `inherit` | explicit level | Validate against `delegation.codex.inheritEfforts`; emit only `reasoning_effort` |
| mapped alias | explicit level | Validate mapping and its `efforts`; emit mapped `model` and explicit `reasoning_effort` |
| mapped alias | `inherit`, known parent effort | Validate the parent level against the mapped model's `efforts`; emit both mapped `model` and that level |
| mapped alias | `inherit`, unknown parent effort | Fail with exit 1 and a hint to choose explicit effort; do not silently omit the field |

Native inheritance means the host runtime resolves the omitted fields; GPS does not override host-level agent defaults. Do not claim that GPS can prove the effective model/effort for this case without runtime evidence.

**Additional rules:** an explicit ticket `--effort` wins over `--parent-effort`. Reject invalid parent-effort strings (including `inherit`, `max`, and `ultra`) with exit 2. Reject `--parent-effort` with `--host claude` as inapplicable; ordinary Claude invocations remain identical. Keep the returned ticket `effort` as the requested hint (`inherit` when applicable); the resolved level is visible in `call.reasoning_effort`. Do not overwrite the ticket. Missing mapping or unsupported inherited level remains an exit-1 failure with no mutation.

**Tests:** cover every row above; known parent level not supported by target; explicit effort overriding a different parent level; invalid flag values; Claude payload regression; identical ticket brief across hosts; unchanged config and session files on failure. Replace the existing test that expects omitted `reasoning_effort` for a mapped model with `inherit`.

**Verification:** `node --test tests/lib/host-dispatch.test.js tests/dispatch-prompt.test.js` exits 0.

### T04 — Add read-only queue preflight

**Files:** new `dispatch-preflight.js` and `tests/dispatch-preflight.test.js`; reuse `lib/host-dispatch.js`; update `skills/gps/SKILL.md`, `skills/gps/references/ship.md`, `README.md`, and `tests/skill.test.js` for script discovery and registration. T06 completes workflow wiring.

**Concrete CLI:**

```text
dispatch-preflight.js --host <claude|codex> --mode <subagent|subagent+inline>
  [--parent-effort <low|medium|high|xhigh>]
  [--override <N>=<model>/<effort>]... [--json]
```

Both host and mode are required. This script is for delegated modes only; inline execution skips it. Use the shared `main` wrapper with `override: 'list'`. Override model/effort values use the existing enums and must contain both parts; the host expands a user-supplied partial override using that ticket's original hints before calling this script. Normalize numeric keys so `01` and `1` identify the same number; reject duplicate override keys and malformed values with exit 2. Reject an override targeting no pending ticket with exit 1. Existing duplicate ticket numbers remain supported: a numeric override applies to every pending ticket with that number, and each result names the full `NN-slug` key.

**Algorithm:**

1. Read the current session and saved queue using `resolveSession` and `readyTickets`. Select all non-Done tickets, including already-started pending tickets. Do not require commit logs to exist.
2. Read config without creating or rescanning it. Apply overrides in memory. Keep existing queue normalization semantics for hand-edited unknown hints, and relay their warnings rather than silently hiding them.
3. Validate each pending ticket using the same Codex resolver as dispatch. For Claude, retain existing hint rules; no Codex mappings are required. Aggregate ticket-specific validation errors in a single `GpsError` so the owner can fix the queue at once. No native tool call is executed.
4. On success return the schema below. On validation failure use the existing stderr/exit-1 contract, with empty stdout. Usage failures use exit 2. A fully completed saved plan succeeds with `allDone: true` and an empty `tickets` list.

**Success JSON schema (example uses test-only model ID):**

```json
{
  "sessionId": "2026-10-12__example",
  "host": "codex",
  "mode": "subagent+inline",
  "allDone": false,
  "tickets": [
    {
      "ticket": "01-example",
      "model": "sonnet",
      "effort": "inherit",
      "resolved": { "model": "test-model", "reasoning_effort": "high" }
    }
  ]
}
```

`model` and `effort` are the effective requested hints after overrides. For Codex, `resolved` contains only emitted `model`/`reasoning_effort` keys, or `{}` for native inheritance. For Claude, `resolved` contains `subagent_type` and optional `model`, matching `buildDispatch` with prompt/description omitted. This JSON is a validation report, not a spawn call. Text output identifies the checked tickets and says runtime capability verification is still required.

**Acceptance:** preflight does not create directories, commit logs, scratch state, config, history, Git commits, or network calls on either success or failure. It catches a missing mapping on ticket 2 before ticket 1 can start. Real dispatch still revalidates using current configuration, so preflight is not a stale authorization token. The check guarantees validation before ticket-start, not before earlier plan-save/branch operations.

**Tests:** use `h.gitProject` and `h.shipReady` with two or more tickets. Snapshot the recursive `.work/` file list and bytes, scratch-directory existence, Git HEAD, index state, and working-tree status before and after each preflight. Test failure on a later ticket; success; no config file; invalid/duplicate/unknown overrides; equivalent zero-padded numbers; duplicate ticket numbers; explicit overrides; known/unknown inherited effort; unsupported level; no current session; pending unsaved plan; all Done; and parity with actual dispatch for the same effective hints after `ticket-start`. Use no real model or network service.

**Verification:** `node --test tests/dispatch-preflight.test.js tests/dispatch-prompt.test.js tests/skill.test.js` exits 0. Add the alphabetically ordered `dispatch-preflight.js` allowlist entry and mention the new script in `ship.md`; no new user-facing `/gps` subcommand is needed.

### T05 — Document reproducible Windows installation

**Files:** `README.md`, new `docs/CODEX-SETUP.md`, and only the marketplace metadata required by the verified route. Update packaging tests if metadata is added.

**Implementation:** inspect `codex --version`, `codex plugin --help`, `codex plugin marketplace add --help`, and `codex plugin add --help` on the tested machine. The [official packaging documentation](https://developers.openai.com/plugins/build/plugins) lists `.claude-plugin/marketplace.json` as a legacy-compatible desktop marketplace source. This repository already supplies that file, named `grill-plan-ship`, with a plugin of the same name and source `./`. Start by testing that existing route; no additional marketplace manifest is required by this plan. Documentation support is not evidence of a successful installation on the targeted client.

Use this concrete local-checkout recipe as the first CLI installation test. Replace the two example paths with the reviewed plugin checkout and the disposable test project. The commands follow the [official CLI reference](https://learn.chatgpt.com/docs/cli/reference), but have not been executed as an installation during this review:

```powershell
codex --version
node --version
git --version
codex plugin marketplace add 'C:\path\to\grill-plan-ship' --json
codex plugin marketplace list --json
codex plugin list --marketplace grill-plan-ship --available --json
codex plugin add 'grill-plan-ship@grill-plan-ship' --json
codex plugin list --marketplace grill-plan-ship --json
codex -C 'C:\path\to\gps-smoke-project'
```

Run one command at a time and stop on a nonzero exit. Check that the marketplace root points to the intended checkout, the plugin is available before installation, and its installed path/version match the files being reviewed. A GitHub-only install would miss uncommitted fixes. Enter `$gps help` inside the Codex conversation, not at a PowerShell prompt. If cached files are stale, use the tested client's supported refresh/reinstall operation and record it; do not manually delete the user's plugin cache.

For desktop, reopen the client after CLI installation, open the smoke project, inspect the Plugins directory for the `grill-plan-ship` source/plugin, enable it if required, and run `$gps help`. Verify that the installed files are the same revision used by CLI. If the source is not visible, inspect supported marketplace configuration rather than assuming CLI and desktop share it. The official fallback format is a repo-scoped `.agents/plugins/marketplace.json` with a `plugins` entry whose source is `{ "source": "local", "path": "./plugins/grill-plan-ship" }`, pointing to an actual plugin copy under that marketplace root. Use marketplace name `gps-local` for this fallback, making the selector `grill-plan-ship@gps-local`. Record which route passes; do not mix selectors between routes or add a guessed `.codex-plugin/marketplace.json`.

Document concrete PowerShell commands to register the supported local or repository marketplace, install GPS, refresh/reopen the client if required, open a target checkout, and invoke `$gps help`. Provide a desktop installation path verified in its actual UI; if the desktop shares a CLI-installed plugin, verify visibility rather than assuming it. Explain Node 20+, Git, and optional authenticated `gh` prerequisites, script paths containing spaces, and running scripts from the target project root rather than the plugin cache.

Keep `plugin.json` as the portable entry point. Add a compatibility manifest only if a specifically targeted client demonstrably requires it, and then include it in version consistency checks and release version-file handling. Do not confuse the tested client version with a proven minimum supported version.

**Acceptance:** a Windows user can follow the instructions from plugin absence to a discovered GPS skill in CLI and desktop. Model mapping examples clearly mark placeholders and explain that available IDs and efforts must be inspected locally. Include native `inherit/inherit` and inline options without silently selecting them as fallbacks. Link the setup guide from the README. Record any unverified UI step as such until T07 supplies evidence.

**Verification:** T07 performs the live checks. Automated packaging checks verify actual referenced local resources and matching manifest versions. Run `node --test tests/skill.test.js tests/lib/version-files.test.js` after any packaging change; no live installation is part of `npm test`.

### T06 — Wire preflight, runtime checks, and recovery into workflows

**Files:** `skills/gps/references/ship.md`, `skills/gps/references/auto.md`, `skills/gps/references/plan.md`, `skills/gps/references/config.md`, `skills/gps/scripts/config.js`, `tests/config.test.js`, `tests/skill.test.js`, `README.md`, and decision 0006.

**Required sequence for delegated ship:** save an approved plan if needed; read queue; choose mode and accepted overrides; resolve any required parent effort or explicit effort choice; run the whole-queue preflight; verify the client's native spawn tool and all requested model/effort overrides can be honored; only then run `ticket-start` for the first ticket. Pass the identical effective overrides and parent effort into each `dispatch-prompt` call. Keep the existing DONE/READY review and completion checks. Recheck capability after a client/model change; never drop an override to make a call succeed.

Preflight validates project declarations, not account availability. The host must use its actual tool schema and available model information. If this cannot be established, stop before ticket-start with the precise missing capability. No hard-coded production model ID or guessed mapping. Preserve `fork_turns: 'none'` and the complete brief for Codex.

`$gps ship N` remains inline and skips delegation validation. `$gps auto --delegate` runs the same preflight after drafting/saving the plan; a failure stops before the implementation loop and does not run finish. Clarify the existing “ask nothing else” wording: it suppresses routine repeated choices, not required resolution of an unknown effort or unavailable mapping. Do not retry automatically, change modes, or restart completed tickets.

Make `/gps config` useful for Codex onboarding: add a top-level `delegation` field to its JSON output (`config.delegation || null`) and readable text listing the stored Codex mappings and `inheritEfforts`, or saying they are not configured. Label these as declared settings, not live capability detection. Do not add setters, silently populate mappings, or change GitHub/Jev rescan behavior. Older configs without `delegation` continue to work. Planning should point to this configuration guidance before a delegated auto run, without preventing portable plans from being saved for later use.

**Acceptance:** workflow instructions enforce the preflight-before-start order and name `dispatch-preflight.js`; config output exposes the relevant settings; existing explicit stop/recovery rules remain intact. Do not add a `--host` option to every shared script.

**Tests:** config without mappings, configured mappings, JSON/text output, rescan preserving mapping fields, and existing config tests. Adjust structural skill tests for the new workflow and retain size limits. Runtime behavior belongs in T07, not only regular-expression assertions on prose.

Example handoff between preflight and dispatch, from the target repository root (resolve each filename to the installed skill's absolute script path in real use):

```text
dispatch-preflight.js --host codex --mode subagent+inline --override 1=sonnet/high --parent-effort medium --json
ticket-start.js 1 --mode subagent+inline
dispatch-prompt.js 1 --host codex --mode subagent+inline --model sonnet --effort high --parent-effort medium --json
```

The host performs the runtime capability check between the first and second commands. Preflight validates all pending tickets, not only ticket 1. The explicit `high` for ticket 1 takes precedence over `medium`; the latter supplies known parent effort for other mapped-model tickets requesting `inherit`. Use these sample levels only when they match actual runtime context and configured support.

**Verification:** `node --test tests/config.test.js tests/auto-route.test.js tests/dispatch-preflight.test.js tests/skill.test.js` and `node tests/check-skill-size.js --max 200`, all exit 0.

### T07 — Run regression and live compatibility checks

**Files:** new `docs/CODEX-SMOKE-TEST.md`; correct any implementation/docs failures found. Do not put fabricated runtime results in automated tests.

First run the full deterministic suite with `npm test`, syntax-check every changed/new JavaScript file using `node --check <path>`, and run `node tests/check-skill-size.js --max 200`. Expected result: exit 0, all tests passing; the test-file count will exceed the original 60 after adding preflight coverage.

For live checks, use a disposable local Git repository outside the plugin checkout, with an initial commit and no remote. Run one host at a time. Keep Jev disabled and do not supply a TypeSafe key for this smoke test. Use the real GPS workflows to create session state. The owner chose Windows CLI and desktop; access to an authenticated Claude Code installation is also needed to prove cross-host resume. If unavailable, mark that row blocked rather than bypassing it.

Use a tiny fixture: an existing `app.js` exports `add(a, b)` and an existing `verify.js` asserts its result. A first approved ticket adds and exports `subtract(a, b)` with a corresponding assertion; a second adds and exports `multiply(a, b)` and its assertion. Use `node verify.js` as verification, expecting exit 0. Each ticket touches only `app.js` and `verify.js` and should produce its own code commit plus GPS's normal session-record commits.

| Check | Procedure | Pass evidence |
|---|---|---|
| CLI discovery | Follow T05 from an uninstalled state, open fixture repo, run `$gps help` and `$gps status` | Correct skill loaded; paths resolve; read-only commands do not create session state |
| Desktop discovery | Follow documented desktop route on same Windows machine | GPS appears and `$gps help` runs against the selected project |
| Inline | Approve a two-ticket plan and run `$gps ship 1` | Verification passes; first ticket Done; only intended files in code commit; no mappings needed |
| Delegated follow-up | Configure a real available model and supported explicit effort, run remaining ticket with subagent+inline | One child; requested overrides honored; READY result reviewed; parent verifies and completes ticket |
| Delegated completion | In a fresh fixture session use subagent mode for one ticket | Child completes; DONE is followed by successful `ticket-check`; one code commit |
| Unknown inherited effort | Exercise resolver with mapped model/`inherit` and no parent effort | Clear failure before ticket-start; explicit effort choice recovers without rewriting ticket hints |
| Unsupported effort/missing mapping | Put failure on the later of two pending tickets and preflight | No implementation logs/history added for either ticket; all relevant errors identify tickets |
| Native inheritance | Use explicit `inherit/inherit` in a fresh fixture | No model mapping required; omitted overrides accepted by the actual client; do not invent effective effort evidence |
| Missing runtime capability | Inspect/test a client configuration lacking the required tool or model if available | Honest pre-start stop; no silently discarded model/effort; otherwise record not run |
| Claude to Codex resume | Create/save a plan in Claude, complete one ticket, close that run, open same checkout/branch in Codex | Same session and Done ticket recognized; only remaining work runs |
| Codex to Claude resume | Repeat in reverse using a fresh session | Same shared-state behavior; Claude dispatch unchanged |
| Local finish | Finish completed fixture with no remote | Session closes and INDEX is written; no push, PR, or issue operation attempted |

At least one delegated execution must be verified in each targeted Codex surface, CLI and desktop. Record date, OS, exact client versions, plugin commit or dirty-working-tree identity, model/effort requested and observed when available, commands/actions, outcomes, and relevant sanitized evidence. Never include tokens or credentials. Mark each row `PASS`, `FAIL`, `BLOCKED`, or `NOT RUN`; a generated JSON call alone cannot establish a live spawn pass.

**Completion boundary:** deterministic fixes can be reported complete when their tests pass. Full Windows CLI/desktop compatibility can be reported verified only for the live rows actually passed. If a required live row is blocked, finish all independent fixes and describe the exact missing access or capability; retain the partial-verification qualification in this report.

### Final implementation checklist

- [x] T01 privacy and permissions text matches existing behavior.
- [x] T02 question interfaces work with both hosts' capabilities.
- [x] T03 effort inheritance follows the owner-approved decision and has regression coverage.
- [x] T04 whole-queue validation has no mutation and uses the same resolver as dispatch.
- [ ] T05 Windows CLI setup verified; desktop route documented but blocked pending UI access.
- [x] T06 workflows validate before ticket-start and never silently substitute settings.
- [x] T07 full suite, syntax, size checks, and live verification results are recorded accurately; required desktop/delegation/resume rows remain blocked or not run.
- [x] Decision 0006 and command references match the final implementation; do not leave competing alternatives in the handoff.
- [x] Review the diff for unrelated edits, generated artifacts, secrets, accidental version changes, and modifications to pre-existing user work.

Suggested implementer starting prompt: “Implement T01–T07 in docs/REVIEW-codex-compatibility.md using the confirmed decisions and contracts. Inspect the working tree first, preserve existing changes, and work sequentially. Run focused tests per ticket and the full suite at the end. Record live checks truthfully; finish independent work when a live environment is unavailable. Do not publish or release.”

## Implementation results (2026-10-12)

T01-T04 and T06 are implemented with passing focused checks. T05 supplies a verified Windows CLI installation and refresh route plus a clearly unverified desktop procedure. T07 records all 61 passing test files, syntax checks of 15 changed/new JavaScript files, skill size (76 lines), successful live CLI discovery and the precise outstanding checks. The user prohibited creating a GPS session during implementation, so live ticket execution/resume/finish was not run. Desktop UI access is unavailable. No full cross-host/delegation claim is made. See [setup](CODEX-SETUP.md) and [smoke results](CODEX-SMOKE-TEST.md).
