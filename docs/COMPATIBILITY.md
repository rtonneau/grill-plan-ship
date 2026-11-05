# Compatibility and validation

Recorded 2026-11-04 on Windows 11 with Claude Code 2.1.318, Codex CLI 0.166.0, Node 22.14.0, Git 2.39.0.windows.2. This replaces the earlier smoke-test record.

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
