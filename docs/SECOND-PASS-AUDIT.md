# GPS v3 second-pass audit

2026-11-05. Baseline: clean checkout at `e065d78` (v3.0.0); review range `v2.12.0..v3.0.0`, including the changed commands, adapters, tests, manifests, documentation and their persistence/Git dependencies. The original suite passed **138/138**, none skipped, in 303.6 seconds before behavior changes. Work remained in the current checkout; no remote was changed and no release was made.

## Findings and corrections

Severity describes the consequence, not the amount of code changed. Reproductions use real scripts and Git repositories; GitHub and Jev network boundaries use stubs. Tests named below contain the executable reproduction.

| Severity | Affected files | Reproduction / evidence | Consequence and correction | Status |
|---|---|---|---|---|
| Critical | `lib/git.js`, `finish.js` | Dirty `app.js`, with distinct staged and unstaged edits: finish committed both. `tests/lib/git.test.js`, `tests/finish.test.js` | Unrelated work could be published. Finish now refuses tracked leftovers without staging; the parent must select and review intended files. | Fixed; pre-existing |
| Critical | `lib/git.js` | `commitFiles(['*.js'])` captured another file; directory arguments captured descendants; partial staging was replaced. A pre-commit hook added a private file outside the requested scope. | Literal individual file paths and partial-staging checks protect the index. Post-hook scope verification records unexpected commits and blocks GPS pushes, including retries, until explicit review. | Fixed; pre-existing |
| Critical | `lib/project-config.js`, `config.js`, `jev-hints.js` | Fake key in a fresh project plus intercepted fetch produced a complete-ticket request without consent. `tests/jev-hints.test.js` | Credentials were treated as transmission authorization. Jev now starts disabled and requires explicit consent; legacy auto-enabled configs remain readable but inactive. | Fixed; pre-existing |
| Major | `finish.js`, `lib/github.js` | Missing push destination, failed PR lookup, failed record hook, process exit after pointer removal, interruption after a successful remote comment. `tests/finish-recovery.test.js` | Finish could claim success and strand delivery; lookup failure could permit another create. Required failures now return nonzero; a local journal selects the exact retry, and remote markers reconcile ambiguous success. | Fixed; pre-existing |
| Major | `lib/guard.js`, `write-apply.js` | Inject partial phase write or deny rename with EPERM/EACCES; retry previously saw truncated content as already saved. `tests/write-apply.test.js` | Phase state became unrecoverable. Atomic replacement retains previous files and payloads; denied rename no longer falls back to truncation. | Fixed; pre-existing |
| Major | `ticket-complete.js`, `lib/commit-log.js` | Remove verification/review/blocker sections; completion previously succeeded. Interrupt completion-log write after code commit; queue previously advanced past a truncated log. `tests/ticket-complete.test.js` | Unverified or incomplete records could authorize finish. Required sections are checked before Git; atomic log writes retain narrative and report the existing SHA for `--commit` recovery. | Fixed; pre-existing |
| Major | `lib/session-store.js` | Replace session config with `[]`; ticket completion previously committed code while serialization discarded history. `tests/finish-recovery.test.js` | Structurally invalid state silently lost updates. Non-object configs now fail before mutation; legacy objects remain readable. | Fixed; pre-existing |
| Major | `dispatch-prompt.js`, `lib/host-dispatch.js`, `references/ship.md` | Explicit `--effort high` with a low-only pin returned success without `reasoning_effort`. Dispatch tests cover requirements separately from hints. | An explicit requirement was silently dropped. Provenance is retained; incompatible requirements fail and live host capability validation remains the parent's responsibility. | Fixed; introduced in v3 |
| Major | `dispatch-prompt.js`, `references/ship.md` | Installed Claude child retried a denied shell action through PowerShell; parent then verified and completed the ticket. Live candidate transcript, not a mock. | Denial was treated as a recoverable technical failure. Child and parent now explicitly stop across shells/tools/agents. A fresh installed probe blocked without editing code or committing. | Instruction corrected; live regression passed once |
| Major | `references/auto.md` | v3 explicitly treated newly drafted high-risk tickets as approved, contrary to ADR 0013. | Auto could bypass meaningful approval. It now requires approval of the actual high-risk tickets, including on resume. | Instruction corrected; interactive live gate not verified |
| Moderate | `lib/jev.js` | Fetch returns headers while the body waits for abort: a 20 ms timeout previously stopped covering the body. `tests/lib/jev.test.js` | Optional classification could hang planning. The timer now remains active through body parsing, retaining graceful fallback. | Fixed; pre-existing |
| Moderate | `references/start.md` | A saved small resume was directed to `/gps plan`; size is deliberately not stored (ADR 0013). | Resume now inspects saved scope and Git state before continuing small work. Auto still routes this state through planning. | Start guidance fixed; auto limitation retained |

The changes retain adaptive sizing, parent-only commits, sequential ticket writers, native host permissions, portable sessions and dependency-free scripts. Five correction areas cover ownership, external consent, finish recovery, state integrity and dispatch/approval behavior. No model registry, scheduler or parallel-ticket framework was added.

## Integration evidence

See [COMPATIBILITY.md](COMPATIBILITY.md) for the host matrix, exact evidence boundaries and official sources. Installed v3 caches on both CLIs exposed GPS and ran help successfully; their router hashes matched the checkout before edits. CLI tests used installed plugins, with no `--plugin-dir`, skill symlink or `--disable plugins` shortcut.

Live logs are local audit artifacts under `%TEMP%/gps-second-pass-551eb2022097490d9ba99daec83faf59/`; they are not committed. They contain synthetic project work, not project credentials. Retain them for reproducing the host results on this machine.

## Residual risks and reproduction

- **Host permissions:** a sandbox or deny rule can still block Git or atomic rename. Repeat the installed smoke under the target policy, inspect the exact denied action, and use that host's normal approval mechanism. No fallback bypass is provided.
- **High-risk approval and classification:** these are agent judgments, not script-enforced authorization records. Exercise an interactive high-risk auto request with an unapproved plan to verify the host asks before implementation. Headless tests cannot prove that interaction.
- **Small + auto resume:** a saved resume without a plan does not encode whether it is Small or Standard. Use `/gps start <same-name>` to inspect and resume, or `/gps finish` after verification and a scoped commit. Auto deliberately takes the planned route.
- **External exactly-once semantics:** local journals plus remote marker lookup cover tested interruption windows, but GitHub eventual consistency, remote edits and arbitrary failures cannot provide a distributed exactly-once guarantee. Repeat with a disposable authorized GitHub repository before claiming live publication support; this audit was not authorized to publish.
- **Issue creation:** `write-apply.js` can still lose the local issue identifier if GitHub creates the issue and saving the returned identifier fails. This pre-existing window is separate from finish's comment reconciliation. Before retrying an ambiguous issue-create failure, inspect GitHub and recover the existing issue; do not assume the failed command created nothing.
- **Local-only recovery:** Git-private journals and publication guards stay with the worktree. A fresh clone lacks them and any uncommitted work. They are not a replacement for portable committed session files.
- **Finish versus auto:** failed final record delivery may leave `finished_at` and no current pointer while the local journal remains. Status reports pending delivery; resume with `/gps finish`. Auto does not resolve that private journal.
- **Ownership within one file:** GPS can protect named paths and partial staging, but cannot infer the authorship of every unstaged hunk. The parent must inspect the pre-existing diff and preserve user edits. Trusted Git hooks can run arbitrary code; detecting unexpected committed paths is not a hook sandbox.
- **Same-worktree concurrent sessions:** GPS assumes one writer. The audit does not establish safety for concurrent processes editing the same ticket or finish journal.
- **Runtime capability overrides:** account policy, environment variables and host mods can affect actual child model/effort. Require observable support for an explicit requirement; fixture call generation alone does not prove the model that ran.

## Before / after

| Dimension | v3.0.0 baseline | Second pass |
|---|---|---|
| Reliability | 138 passing test cases, but reproduced interruption and retry failures | Behavioral regressions cover phase/log corruption, invalid state, deleted-file retry and partial delivery |
| Safety | Finish swept tracked changes; key presence enabled transmission | Explicit commit scope, protected staging, publication guard and explicit Jev consent |
| Autonomy | Routine implementation and bounded recovery | Preserved; stops concern ownership, requirements, permissions or actual approval |
| Friction | Silent shortcuts could discard control | Additional stops only for verified unsafe/unsupported cases; small resume guidance avoids an unnecessary plan |
| Context / tooling | Router 78 lines; references 211 lines; combined 26,827 bytes | Router 78 lines; references 215 lines; combined 28,822 bytes (LF-normalized); still 24 GPS script entry points and zero runtime dependencies |
| Host compatibility | Earlier live tests used plugin-dir / skill links | Installed-plugin results are separated from fixture and documentation evidence |
| Maintainability | No recovery record for delivery boundary | Small explicit records and focused regressions; migration notes explain changed defaults |

No token, latency or cost improvement is claimed. Test wall time depends on this Windows machine and concurrent processes, so it is not a performance benchmark.

## Validation

- Original `npm test`: 138/138 passed, none skipped, 303.6 seconds.
- Final hardened `npm test`: **139/139 passed**, none skipped, 323.9 seconds, including the final child-denial instructions. The preceding full run also passed 139/139 in 362.0 seconds.
- Skill size check: GPS 78 lines, Idea 64 lines; reference limits remain enforced. Claude manifest validation and `git diff --check` pass.
- `.work/changelog/2026-11-05__second-pass-hardening.md` records the current changes as a patch fragment and passes the repository's fragment parser. No version or release tag was changed.

## Local implementation commits

| Commit | Scope |
|---|---|
| `7cd0cfe` | Literal commit scope, partial staging and publication guard |
| `63c9d38` | Atomic phase/log writes and required verification records |
| `11e4022` | Explicit Jev consent and response-body timeout |
| `9f1c1a3` | Finish journal, GitHub reconciliation, state validation and pending-delivery status |
| `e9958ed` | Required dispatch capabilities, denial recovery, high-risk approval and Small resume |
| `daad00f` | Patch changelog fragment for this audit |

The documentation commit adds this report, compatibility evidence, migration notes and ADR 0015. All commits are local; no push, release or remote repository mutation was performed.
