# Dual-host audit (Claude Code + Codex)

Date: 2026-10-12. Scope: uncommitted working tree on top of `1c9d221` (2.7.1). Read-only audit; nothing except this file was created or modified.

## Verdict

**Nothing is broken today.** The Claude Code path is intact and the Codex path works as far as it has been tested. The risks left are (a) things never exercised live and (b) a few wording regressions on the Claude side. None of them blocks a commit.

## What I verified

| Check | Result |
|---|---|
| `npm test` | PASS, 61/61 test files, 0 failures |
| `node tests/check-skill-size.js --max 200` | PASS (SKILL.md 76 lines) |
| `node --check` on every new/changed `.js` | PASS |
| `git diff --check` (whitespace) | clean |
| `claude plugin validate .` | PASS (advice only: README has no `/plugin install ... --marketplace` line) |
| Version parity `package.json` / `plugin.json` / `.claude-plugin/*` | all 2.7.1, enforced by `tests/skill.test.js:123-128` |
| Claude dispatch unchanged | `--host` defaults to `claude`; `subagent_type` `grill-plan-ship:gps-ticket-<effort>` / `general-purpose` asserted in `tests/dispatch-prompt.test.js:23,103-109`; preflight Claude branch asserted at `tests/dispatch-preflight.test.js:81-82` |
| Config rescan keeps the new `delegation` key | yes, writers spread `...existing` (`lib/project-config.js:144,168`) |
| Codex installed cache matches checkout | `skills/`, `agents/`, `plugin.json` identical to `~/.codex/plugins/cache/.../2.7.1` |
| Privacy docs | Jev/TypeSafe transmission now disclosed in PRIVACY.md and README |

## Issues, by priority

### 1. [Medium] Codex spawn contract is unverified against a real client
`lib/host-dispatch.js` emits `task_name`, `message`, `fork_turns: "none"`, `model`, `reasoning_effort`. `docs/CODEX-SMOKE-TEST.md` shows no delegated ticket ever ran (all delegation rows are NOT RUN or BLOCKED). If Codex's real `spawn_agent` schema names these fields differently, every delegated ticket fails or silently drops the model/effort override. The adapter tests only prove the output matches the adapter's own expectations.

**Fix:** run the two-ticket live procedure from `CODEX-SMOKE-TEST.md` ("Remaining live procedure") once, in a disposable repo, and record the actual tool schema. Until then, state in README that Codex delegation is untested and inline mode is the supported path.

### 2. [Medium] Claude question-handling got weaker
The old `SKILL.md` said every question, in every phase, goes through `AskUserQuestion`, with free text only when no answer set fits. It overrode the external grill skills' "ask in chat". `start.md` also told Claude to send the frontier in calls of up to 4 questions and put reasoning in option descriptions. The new host rule says "in Claude Code use `AskUserQuestion`" and the batching/option-description guidance was dropped from `start.md`. This is wording, not code, so no test catches it, but Claude may drift back to chat questions (for example under `superpowers:brainstorming`).

**Fix:** in the SKILL.md host rule, restore for Claude Code: "every question goes through `AskUserQuestion`; free text only for open-ended answers; batch the frontier up to 4 per call with reasoning in the option descriptions". Keep the Codex fallback as is.

### 3. [Low] PR attribution changed for Claude sessions too
`lib/github.js` now writes "Generated with grill-plan-ship" instead of the Claude Code line, regardless of host. This is intentional (decision 0006: sessions can span hosts) and tests were updated. Be aware that the harness's own PR attribution instructions (Claude Code) are no longer reflected in `/gps finish` PRs.

**Fix:** none needed if intended. Otherwise make it host-aware or drop the line.

### 4. [Low] Codex desktop and cross-host resume are unverified
The smoke test marks desktop discovery, Claude-to-Codex resume, and Codex-to-Claude resume as BLOCKED or NOT RUN. README already says so honestly.

**Fix:** run those rows once; update README when done.

### 5. [Low] Jev hints are Claude-family aliases
`lib/jev.js` asks "Which Claude model should implement the ticket". On Codex, every Jev-drafted `haiku`/`sonnet`/`opus` hint needs a `delegation.codex.models` mapping, otherwise preflight fails (by design, no silent fallback). Fresh projects have no mappings, so the first `$gps ship` in delegated mode on Codex will always stop until configured.

**Fix:** have `/gps init` or `/gps config` offer to seed `delegation.codex` (the docs say no setter exists), or make `plan` skip model hints when the host is Codex.

### 6. [Info] Manifest details to confirm
- Root `plugin.json` uses `$schema: https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`. I could not validate that URL or schema offline; the live Codex install did accept the manifest.
- `.codex-plugin/plugin.json` and `.agents/plugins/marketplace.json` do not exist. The legacy `.claude-plugin/marketplace.json` route worked on Codex CLI 0.162.1 only; the desktop fallback in `CODEX-SETUP.md` is untested.
- `agents/gps-ticket-*.md` are Claude-only (the `effort` front matter); Codex ignores them. Expected.
- Claude's published cache holds 2.7.1 from GitHub, so Claude users are unaffected until you release these changes.

## Recommended order

1. Fix #2 (a five-line SKILL.md edit; protects the main Claude workflow).
2. Run the live Codex smoke procedure (#1, #4), then update README and the smoke-test doc.
3. Decide on #5 and #3.
4. Commit and release through `/gps finish` and `/gps release` (the changelog fragment and the version bump are not part of this audit).

## Limits of this audit

- I did not run a live Codex session or a live Claude `/gps` session; the conclusions rest on the test suite, static review of the diff, the validator, and the existing smoke-test record.
- Test pass shows deterministic behavior only; it does not prove Codex accepts the emitted spawn call.
