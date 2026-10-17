# Codex compatibility checks

Recorded 2026-10-12 on Windows NT 10.0.26100.0. Codex CLI: 0.162.1; Node: 22.14.0; Git: 2.39.0.windows.2; Claude Code binary: 2.1.296 (`claude.cmd --version`). Claude authentication and desktop application version were not verified. No desktop UI automation is exposed in this execution environment.

Plugin version: 2.7.1. Identity: dirty working tree based on commit `1c9d221332f30f67287c6bae2eb9bdecc5fe166a`, including the T01-T07 fixes. The checkout already had uncommitted port changes; they were preserved. No version bump, release, publish or push was performed.

Installed resource identity: SHA256 `e8fd60b38593f0350b455a7f22c8e97f013497147b594c1ff2ddb08bb98465d0`. This digest covers all 87 files under `skills/`, `agents/`, plus `plugin.json`, `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`: sorted relative paths with forward slashes, then for each file path + NUL + raw file bytes + NUL. All 87 installed resources matched the final checkout byte for byte after refresh. Documentation and tests are excluded from this digest.

## Deterministic checks

| Check | Status | Evidence |
|---|---|---|
| Focused ticket checks | PASS | Skill/size, host-dispatch/dispatch-prompt, preflight, packaging/version-files, config and auto-route checks all exit 0 |
| Full suite | PASS | `npm.cmd test`: 61 test files passed; 0 failures, skips or cancellations |
| Syntax | PASS | `node --check` on all 15 changed/new JavaScript files, including pre-existing port changes |
| Skill size | PASS | `node tests/check-skill-size.js --max 200`: GPS 76 lines; structural checks also retain router under 100 and command references at most 40 |
| Queue validation and no mutation | PASS | Preflight tests snapshot recursive `.work/` and scratch files/directories, HEAD, index and status on success/failure; later-ticket errors aggregate before any start |
| Inherited effort and recovery | PASS | Shared resolver/CLI tests exercise unknown parent, known supported/unsupported parent, explicit precedence and native omission; no ticket/config mutation |

Windows PowerShell execution policy blocks `npm.ps1` and `claude.ps1`; the installed `.cmd` launchers work without changing execution policy. The initial sandboxed Codex registration failed because it could not resolve its home directory. Approved execution outside that sandbox succeeded; no guessed home override or manual cache deletion was used.

## Live results

The disposable repository was `C:\Users\rtonneau\AppData\Local\Temp\gps-codex-discovery-Ddqwsn`, with an initial local commit, no remote, `app.js` exporting add and `verify.js` asserting add. The live invocation ran read-only and did not use Jev. The user explicitly prohibited creating a GPS session, so session-based live workflows were not run. Automated fixtures remain separate from live integration evidence.

| Check | Status | Evidence or exact limitation |
|---|---|---|
| CLI marketplace registration | PASS | Existing legacy catalog registered as `grill-plan-ship`; returned root was the reviewed checkout |
| CLI availability and installation | PASS | Available before install; `codex plugin add grill-plan-ship@grill-plan-ship --json` returned cache path/version 2.7.1; plugin list reported installed and enabled |
| Supported local refresh | PASS | Re-running `codex plugin add` refreshed the same version; all 87 installed resources then matched the final checkout |
| CLI discovery/help/status | PASS | Live `codex exec` discovered installed GPS, read its router/references and executed absolute help/status script paths from the fixture root. Help exited 0; status exited 1 with expected `No sessions found`, not a discovery failure |
| Read-only discovery has no session mutation | PASS | Fixture Git status empty afterward; `.work/` and `.scratch/` absent; `node verify.js` exit 0 |
| Desktop discovery/help | BLOCKED | No desktop UI interaction tool available; source visibility, enablement, actual desktop version and revision cannot be observed from the shell |
| Inline ticket | NOT RUN | Requires GPS session creation, prohibited by the implementation instruction |
| CLI delegated follow-up/READY | NOT RUN | Requires approved live tickets/session; generated payload and fixture tests are not live spawn evidence |
| CLI delegated completion/DONE | NOT RUN | Same no-session constraint; no child was spawned |
| Desktop delegated execution | BLOCKED | Desktop UI access unavailable; no actual desktop spawn or override observation |
| Unknown inherited effort recovery in live workflow | NOT RUN | Deterministic coverage passed; live plan/start recovery requires a GPS session |
| Later-ticket missing mapping/unsupported effort in live workflow | NOT RUN | Deterministic no-mutation coverage passed; live queue requires a GPS session |
| Native inherit/inherit spawn | NOT RUN | No live ticket/session; omitted fields verified only deterministically |
| Missing runtime capability stop | NOT RUN | No session-based execution or client configured to exercise this scenario |
| Claude to Codex resume | NOT RUN | Session creation prohibited; Claude authentication not checked |
| Codex to Claude resume | NOT RUN | Session creation prohibited; Claude authentication not checked |
| Local finish without remote | NOT RUN | No live GPS session was created; deterministic end-to-end tests cover local completion |
| Workspace-write session config replacement | NOT RUN | In a disposable workspace-write session, save a one-ticket plan, run `ticket-start.js 1 --mode subagent+inline`, parse the updated `.session-config.json`, and assert no sibling `.tmp-*` remains |

CLI live session requested no model or effort override. Its startup reported model `gpt-6.1-sol`, reasoning effort `medium`, sandbox `read-only`, provider OpenAI. These observations describe the parent discovery run only; they do not prove any child model availability or delegation behavior.

Sanitized actions, run one at a time:

```powershell
codex plugin marketplace add 'C:\Users\rtonneau\DEV\AICODE\grill-plan-ship' --json
codex plugin marketplace list --json
codex plugin list --marketplace grill-plan-ship --available --json
codex plugin add 'grill-plan-ship@grill-plan-ship' --json
codex plugin list --marketplace grill-plan-ship --json
codex exec --ephemeral --sandbox read-only -C 'C:\Users\rtonneau\AppData\Local\Temp\gps-codex-discovery-Ddqwsn' 'Use the installed $gps skill to run help and then status. Do not create a GPS session, write files, install anything, or spawn agents. Report the loaded skill path, commands and results. This is a read-only plugin discovery smoke check.'
```

The loaded skill was `C:\Users\rtonneau\.codex\plugins\cache\grill-plan-ship\grill-plan-ship\2.7.1\skills\gps\SKILL.md`. The actual commands were `node '<installed skill>\scripts\help.js'` and `node '<installed skill>\scripts\status.js'`. Final installed resources were refreshed after the discovery run to include subsequent workflow prose corrections.

## Remaining live procedure

When session creation is authorized and the required clients are available, follow [Windows setup](CODEX-SETUP.md) in a fresh disposable repository outside the plugin checkout. Keep Jev disabled and the TypeSafe key absent; retain no remote. Use real GPS conversations and script workflows to create/save state, rather than writing session records manually.

Use two approved tickets: add/export subtract and assert it; then add/export multiply and assert it. Each touches only existing `app.js` and `verify.js`; both verify with `node verify.js`. Capture code commits separately from normal GPS record commits.

1. Run `$gps help` and `$gps status` before creating state, on CLI and desktop; record exact client versions and installed hashes.
2. Approve a two-ticket plan and run `$gps ship 1` inline; verify first ticket Done and only the intended code files committed.
3. Configure an actually available model and explicitly supported effort. Run remaining ticket with subagent+inline: preflight, actual capability check, one child, observed overrides, READY review, parent verification/completion.
4. In a fresh fixture, test subagent mode: one child, DONE and successful ticket-check. Verify at least one actual delegation in each targeted Codex surface, CLI and desktop.
5. Put missing mapping/unsupported effort on a later ticket: preflight must identify all failures before any ticket-start logs/history. Test mapped model/inherit without parent effort, then recover by an explicit supported choice without rewriting ticket hints.
6. Test native inherit/inherit: no mappings or emitted overrides; record effective runtime settings only if actually observable. Exercise missing tool/model capability if an appropriate client configuration is available; otherwise retain NOT RUN.
7. Create/save a plan in authenticated Claude, complete one ticket and resume the same checkout/branch in Codex. Repeat in reverse with a fresh fixture; only remaining tickets may run.
8. Finish without a remote: INDEX/session close, no push/PR/issue operation. Record PASS, FAIL, BLOCKED or NOT RUN per row, with sanitized actions and requested/observed child settings.
9. On Windows with workspace-write sandboxing, run `ticket-start.js 1 --mode subagent+inline` against an existing session config. Verify exit 0, valid updated JSON, the recorded ship mode and ticket event, and no `.session-config.json.tmp-*` residue. Record the exact Codex client version and sandbox profile.

Deterministic fixes and Windows CLI installation/discovery are verified. Full Windows CLI/desktop delegation and cross-host compatibility remain partially verified until these live rows pass.
