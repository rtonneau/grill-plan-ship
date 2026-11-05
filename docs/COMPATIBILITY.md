# Compatibility and validation

## Shared behavioral roles — 2026-11-05

Windows, Node 22.14.0, Claude Code 2.1.318 and the current Codex Desktop native collaboration tools. **Live** means an actual host/child in a disposable repository; **Schema** means an exposed tool contract; **Docs** means official documentation; **Fixture** means deterministic automated coverage. None implies a permission/security guarantee.

| Check | Evidence and result |
|---|---|
| Shared implementer/reviewer construction | **PASS (Fixture):** both host calls carry identical role text, project/spec/log paths and restrictions. Reviewer requires a full existing commit SHA; invalid roles/bases fail without state writes. Default implementer remains compatible. |
| Native invocation | **PASS (Live):** Claude parent used `Agent`, `subagent_type: general-purpose`, unchanged generated prompt; Codex used `spawn_agent`, `fork_turns: none`, unchanged generated message. Both omitted inherited model/effort. Recovery/re-review used fresh children; Codex names received unique suffixes. |
| Initial implementation | **PASS (Live, both):** children implemented inclusive clamp plus RangeError for reversed bounds, ran `node verify.js`, filled narrative log sections, preserved app.js, HEAD, index and session configuration. |
| Independent review | **PASS for defect detection (Live, both):** after the parent deliberately seeded TypeError, both fresh reviewers found the actual file/line defect and stale passing evidence. Neither accepted/completed the ticket. Codex changed no files; Claude's host read hook added `.work/reads/` telemetry, but reviewer made no source, ticket-log or state edits. |
| Initial Claude report quality | **FAIL → revised (Live):** it also reported an out-of-domain NaN concern and used counts instead of the required final status token. The brief now excludes unsupported input-domain requirements and spells out literal final-line alternatives. The parent must inspect report content, not trust a prefix. |
| Correction and fresh review | **PASS (Live, both):** parent recorded dispositions and recovery count 1; fresh implementers restored RangeError and saved test evidence. Fresh reviewers returned `REVIEWED — no findings — ...`, preserved the count and left acceptance to the parent. Claude requested command/exit evidence; parent reran verification successfully and saved it. |
| Completion ownership / resumption | **PASS (Live, limited):** after all role calls both tickets remained In Progress, HEAD/index/config unchanged. **PASS (Fixture):** block/start retain findings/base/count in either inline/delegate mode; only parent `ticket-complete.js` marks Done. The fixture drives scripts, not an autonomous agent. |
| Model/effort and pins | **PASS (Fixture):** existing aliases, Codex project pins, explicit-requirement refusal and inherit omission still pass. **Schema:** current Codex full-history forks cannot override model/effort, hence fresh context. This pass used inherit live; it did not retest each tier or project pin live. |

**Host contracts.** Codex's tool schema in this chat exposes `task_name`, `message`, `fork_turns`, `model` and `reasoning_effort`; spawn returns identity, completion arrives separately, and `wait_agent` can return only a mailbox/timeout summary (**Schema**, corroborated **Live**). Claude's live parent reported `prompt`, `description`, `subagent_type`, `model`, `effort`, `isolation` and `run_in_background`, with no per-call permission field; transcripts show asynchronous launch acknowledgments followed by completed task notifications (**Schema reported by host**, **Live**). GPS neither assumes synchronous results nor copies one host's fields into the other. Adapters carry lifecycle guidance separately from tool arguments. Role restrictions are behavioral: host permissions and hooks remain in force.

**Docs:** [Claude subagents](https://code.claude.com/docs/en/sub-agents) documents fresh non-fork context, tool filtering, inherited permissions and background completion; [Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents) describes native delegation. Runtime schemas determine calls and available models; no static Codex model table was introduced.

Reproduction artifacts on the audit machine: `%TEMP%/gps-roles-live-3uFO6N/` contains generated dispatch JSON, Claude streaming transcripts, before-review hashes and `final-checks.json`. Disposable repositories: `%TEMP%/gps-roles-claude-sv72Yg/` and `%TEMP%/gps-roles-codex-rT3vH4/`. Each ran implement → seeded defect → review → parent dispositions → one correction → fresh review → parent verification. Claude used `-p --output-format stream-json --verbose --permission-mode acceptEdits --allowedTools ...`; no bypass mode. Codex used this chat's native tools with full filesystem access. Parent and child writes were confined to disposable task files; no publication. Claude's configured read-telemetry hook is an observed exception to whole-tree immutability, not a reviewer-issued edit.

**Limits:** these probes load generated candidate briefs directly; they do not prove refreshed installed-plugin discovery, automatic review selection, unavailable-spawn fallback or an end-to-end ship/finish on either host. Codex CLI, Claude interactive UI, restricted reviewer permissions and denial recovery were not re-tested in this pass. Review selection, report assessment and recovery counts remain parent judgment/instructions, not a new deterministic orchestration engine. Fixtures do not prove host compliance. Prior installed-plugin and denial evidence below remains separately scoped.

Validation: targeted dispatch, adapter, role-flow, help and skill tests passed; router/reference limits (GPS 78 lines, Idea 64) and `claude plugin validate .` passed. The first full suite found a missing ship Examples line used by help (139/140); it was restored. Final `npm test`: **140/140 passed, 0 skipped** (`final-suite.log` in the artifact directory). An independent read-only review of the complete candidate diff found no actionable issues.

## Second pass — 2026-11-05

Windows, Claude Code 2.1.318, Codex CLI 0.166.0, Node 22.14.0. Evidence labels: **Live** is a real host in a disposable repository; **Schema** is its exposed tool contract; **Docs** is official documentation; **Fixture** is an automated stubbed boundary. PASS applies only to the stated observation, not the entire platform.

| Installed-plugin check | Codex CLI | Codex Desktop | Claude Code |
|---|---|---|---|
| Installed discovery and explicit help | **PASS (Live):** existing cached v3 plugin read and help executed | **PASS (Live, limited):** current chat discovered installed GPS and executed cached help with its native tool; no new-chat picker test | **PASS (Live):** namespaced command executed cached help |
| Plain coding prompt leaves GPS idle | **PASS (Live):** one console.log question, no GPS/session | **NOT TESTED** in a fresh chat | **PASS (Live):** one console.log question, no GPS/session |
| Temporary hardened candidate installation | **PASS (Live):** local marketplace add/install; all 98 skill files match checkout hashes | **NOT TESTED** as a refreshed desktop session | **PASS (Live):** local-scope marketplace/install; all 98 skill files match checkout hashes |
| Small flow under restricted permissions | **BLOCKED (Live):** cross-host resume reached code verification, raw Git reported dubious ownership | **NOT TESTED** end to end | **BLOCKED (Live):** bundled shell command denied by narrow allowlist; stopped |
| Cross-host Small resume | **PASS (Live, partial):** read Claude's saved session and continued same work; completion blocked at Git | **NOT TESTED** | **NOT TESTED** reverse direction in this pass |
| Native denial handling | **PASS (Live):** recorded the Git block without a bypass | **NOT TESTED** denial injection | **PASS (Live):** reported denied command and stopped |
| Candidate delegation invocation | **BLOCKED (Live):** raw Git ownership check stopped before spawning; no model/effort invocation proven | **NOT TESTED** for installed candidate | **PASS (Live):** fresh `general-purpose` child, `model: haiku`, `effort: low` in Agent transcript |
| Candidate child-denial recovery | **NOT TESTED:** blocked before child | **NOT TESTED** | **FAIL → PASS (Live):** first parent continued after child denial; revised instructions stopped child and parent, recorded Blocked, preserved code and made no ticket commit |
| Candidate planned local finish | **BLOCKED (Live)** before delegation | **NOT TESTED** | **FAIL** as a safety run: local finish completed only after the first denial-recovery violation; final instructions tested for safe blocking, not successful completion |
| High-risk interactive approval / full auto | **NOT TESTED** live; routing and legacy state covered by fixtures | **NOT TESTED** | **NOT TESTED** live; references reviewed |
| GitHub publication and interrupted delivery | **NOT TESTED** live; **PASS (Fixture)** local bare Git + stub gh failures/retries | **NOT TESTED** live | **NOT TESTED** live; same fixture coverage |

Baseline invocations used the normal installed 3.0.0 caches. The hardened candidate used a separate local marketplace, `gps-second-pass-audit`, installed through each CLI's supported plugin commands. No skill symlink, `--plugin-dir`, or `--disable plugins` was used. The normal installation was preserved. Claude's same-version `plugin update` reported up to date while retaining an older candidate file; uninstall/reinstall of only the temporary audit plugin refreshed it. Installed-file hashes were checked before candidate probes; Claude executed scripts from the registered local marketplace source, with the matching installed cache also verified. Existing desktop chats are not evidence of refreshed plugin discovery. Temporary audit registrations were removed through the supported CLI commands afterward.

Reproduction artifacts on the audit machine: `%TEMP%/gps-second-pass-551eb2022097490d9ba99daec83faf59/`. `codex-help.jsonl`, `claude-help.jsonl` and negative logs cover invocation; `claude-small.jsonl` and `codex-resume.jsonl` cover the same disposable Small session. `claude-candidate-delegate.jsonl` captures the initial failed denial recovery; `claude-candidate-denial.jsonl` captures the corrected stop, and `codex-candidate.jsonl` the pre-spawn ownership block. Restricted probes used Codex `workspace-write` with approval `never`, and Claude `dontAsk` with explicitly allowed tools. The first delegated probe exposed a child shell retry and parent takeover after denial; neither was accepted as successful safety behavior. The fresh regression probe denied a compound write/test command before mutation, then the parent ran only the permitted block-recording script. This is one observed instruction-following result, not a security guarantee. External repository writes were outside the audit's authorization.

Official sources rechecked on 2026-11-05:

- [OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins): portable manifest, local marketplace and installed cache workflow (**Docs**).
- [Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents): native invocation and model/effort inheritance (**Docs**). The runtime tool list, not a static GPS table, determines available combinations (**Schema**).
- [Claude subagents](https://code.claude.com/docs/en/sub-agents): model aliases and per-invocation effort since 2.1.292; environment or policy can override effective effort/model (**Docs**). A requested field is not proof of the backend model that executed it.
- [Claude plugins](https://code.claude.com/docs/en/plugins): installed skill namespacing (**Docs**, corroborated by live invocation).

See [SECOND-PASS-AUDIT.md](SECOND-PASS-AUDIT.md) for regression results, findings and remaining recovery limitations.

## Historical first-pass record — 2026-11-04

The following evidence predates second-pass hardening. It used plugin-dir/linked skills and must not be read as installed-plugin verification. Recorded on Windows 11 with Claude Code 2.1.318, Codex CLI 0.166.0, Node 22.14.0, Git 2.39.0.windows.2.

Evidence labels: **Live** = run on real hosts in a disposable repo. **Schema** = read from the host's own tool list. **Docs** = official documentation only. **Fixture** = automated test with stubs.

## Platform capabilities

| Capability | Claude Code | Codex | Evidence |
|---|---|---|---|
| Skills with progressive disclosure | Yes | Yes | Docs, Live |
| Plugin bundles skills | Yes, `.claude-plugin/plugin.json` | Yes, root `plugin.json` | Docs; `claude plugin validate` passes |
| Plugin bundles agents | Yes | Not documented | Docs |
| Per-call model | `haiku`, `sonnet`, `opus`, `fable` aliases | `model` from the tool's list | Live |
| Per-call effort | `effort` (v2.1.292+) | `reasoning_effort` | Live |
| Unsupported effort | Falls back to the highest level at or below it | Varies by model; `gpt-6-luna` lists no `xhigh` | Docs (Claude), Schema (Codex) |
| Fresh child context | Non-fork `general-purpose` | `fork_turns: none` | Live |
| Worktree isolation for children | `isolation: worktree`, from the default branch | Not in the subagent docs | Docs; GPS does not use it |
| Lifecycle hooks in plugins | Yes | Only manually installed desktop plugins | Docs; GPS does not use them |
| `.git` writable in the default sandbox | Under the host's permission rules | No: read-only in `workspace-write` | Live |

Codex's `spawn_agent` parameters, read from a live session: `task_name`, `message`, `fork_turns`, `model`, `reasoning_effort`.

## GPS workflows

| Scenario | Claude Code | Codex CLI |
|---|---|---|
| Plugin validates | PASS, `claude plugin validate` | Not re-run: plugin install unchanged from the earlier record |
| Discovery, explicit invocation | PASS | PASS via `.agents/skills` link, `--disable plugins` |
| Negative trigger: plain coding request ignored by gps | PASS (1 prompt) | PASS (2 prompts) |
| Small flow, no questions, finished | PASS | PASS |
| Planned, delegated, to finish | PASS | PASS for one delegated ticket with finish, on a session Claude started |
| Hint requested on the spawn call | PASS: `model: haiku, effort: low`, seen in the transcript | PASS: `gpt-6-luna`, `low`, as reported by the parent |
| No hints | PASS: both omitted | PASS: both omitted |
| Denied git write | n/a | PASS: the agent recorded the block and stopped; it did not route around the sandbox |
| Resume a blocked session from the other host | PASS: Codex → Claude finished both tickets | n/a |
| Resume a part-done session from the other host | n/a | PASS: Claude → Codex finished it |
| GitHub branch, PR, issue | Fixture only (stub `gh`) | Fixture only |
| Desktop app | Not tested | Not tested |
| Interactive question tools | Not tested live: `-p` runs can't answer them | Not tested live |
| Installed-plugin path on this version | Not tested: runs used `--plugin-dir` | Not tested: runs used a skill link |

## Codex sandbox behavior

Under `workspace-write`, Codex documents `.git` as read-only, so GPS's commits need approval or a host configuration that allows them. With `approval_policy = never` the commit fails and GPS stops at that ticket with its work intact in the tree. Under full access the whole flow completes. GPS never tries to get around this. If you use `workspace-write`, expect commit approvals, or finish the session from a host that allows them.

## Defects found by this work

| Defect | Evidence | Status |
|---|---|---|
| A blank line in a CRLF ignore file made `.work/` look ignored, silently stopping every record commit | 10 of 139 baseline tests failed on this machine; reproduced with plain `git` | Fixed, regression test |
| `safe.directory` with backslashes never matched for sandbox accounts on Windows | Backslash form refused, forward slashes accepted, inside `codex sandbox`; `isWorkTree` was false on `main` and is true now | Fixed in both skills |
| Default Codex table: `medium` was a previous-generation model, and `fast` claimed `xhigh` | Schema | Table removed |
| Chained finish skipped because it relied on a separate config lookup | Live: an agent skipped it | The script's `Next:` line now carries it, regression test |
| `allow_implicit_invocation: false` hid the skill from explicit `$gps` under `codex exec` | Live: with the file Luna missed the skill in 4 of 5 probes (Sol found it in 1 of 1); without it Luna found it in 3 of 3 | File removed; the description holds the trigger |

The policy result contradicts the docs, which say explicit invocation still works. It may be specific to `codex exec`, and the interactive `$` picker was not tested.

## Test results

| Run | Result |
|---|---|
| Baseline, `main` | 129 of 139 passed; all 10 failures traced to the CRLF defect |
| After the refactor, `npm test` | 138 of 138 passed, none skipped |
| `node tests/check-skill-size.js --max 200` | gps 78 lines, idea 64 lines |
| `claude plugin validate .` | Passed |

## Known limitations

- A first session leaves `.gitignore` untracked unless `/gps init` ran; finish warns about it. This predates the refactor.
- Live evidence is a small sample on one Windows machine with disposable repos. macOS and Linux run only in CI's size check.
- The Codex tier choice depends on the model reading its own tool list. One live `fast` ticket chose correctly; `medium` and `heavy` were not exercised live on Codex.
- Effort on the Claude Agent tool needs v2.1.292 or later. Older versions were not tested.
