# Design: Jev-judged ticket Model/Effort hints

**Date:** 2026-10-08 · **Status:** approved design, awaiting spec review

## Problem

A ticket's `**Model:**`/`**Effort:**` lines are chosen by Claude's own judgment while drafting tickets in `/gps plan` step 3 (`references/plan.md`), per the heuristic written there. TypeSafe's Jev (a System One model, reachable over HTTP with a `TYPESAFE_API_KEY`) can make that same judgment as a typed, structured decision instead of a free-form guess — but only for users who have it configured. It must stay fully optional: a project with no key behaves exactly as today.

## Goal

When `TYPESAFE_API_KEY` is set and not hand-disabled, `/gps plan` asks Jev to judge each ticket's Model and Effort from its drafted content, in one batched HTTP call per plan run. Any ticket Jev didn't judge (not configured, or the call failed) falls back to Claude's existing heuristic, unchanged. Nothing else in the ship pipeline changes: `TICKET_MODELS`, `TICKET_EFFORTS`, the four effort subagents, and `dispatch-prompt.js` are untouched (decisions 0001, 0004).

Decisions (brainstorm, 2026-10-08):
- Call site: during `/gps plan` drafting only, never at `/gps ship` dispatch time, and never when not configured.
- Optionality: env var (`TYPESAFE_API_KEY`) **and** a `.work/gps-config.json` flag (`jev.enabled`), mirroring `github.enabled`.
- Any call failure (timeout, network, non-2xx, missing key) is a warning, never a `GpsError`; it falls back per-ticket, same as "not configured."
- Top-probability answer is used regardless of `confidence` — no threshold, no discarding.
- Jev judges Model among 5 version-named criteria (`sonnet-5`, `sonnet-5.5`, `opus-5`, `opus-5.5`, `haiku-5.5`) for finer-grained judgment, but the value written to **Model:** (what `dispatch-prompt.js` reads) is always the collapsed family (`sonnet`/`opus`/`haiku`) — decision 0004's constraint (the `Agent` tool's `model` parameter only accepts a family alias) stays untouched. The raw answer is never discarded: it's recorded verbatim in a new `**Model (Jev):**` line for audit, which nothing downstream reads.
  - Rejected today: writing the raw version-pinned value to `**Model:**` directly (hits the `Agent` tool wall, decision 0004) and building a 5×4 pinned-version-by-effort agent-file grid (contradicts the one-file-per-effort-level invariant `tests/skill.test.js` checks, and hardcodes first-party Anthropic model IDs that break Claude Code users on Bedrock/Vertex/Foundry, who need a provider-specific ID instead).
- Effort has no such mapping: Jev's 4 criteria (`low`/`medium`/`high`/`xhigh`) are `TICKET_EFFORTS` directly, used as returned.

## The Jev call

`POST https://api.typesafe.ai/v1/systemone`, `Authorization: Bearer ${TYPESAFE_API_KEY}`, one request per `/gps plan` run (not per ticket), via `fetch` (Node built-in; no SDK dependency, per the scripting rule). `AbortController` timeout 15s.

```json
{
  "state": { "tickets": [ { "name": "01-add-parser", "body": "<ticket's drafted Acceptance Criteria / Files to Touch / Verification Step / Notes>" }, ... ] },
  "model": "jev-latest",
  "questions": {
    "model_01-add-parser": {
      "type": "choice",
      "instructions": "Which Claude model should implement the ticket at `state.tickets[0].body`?",
      "criteria": {
        "haiku-5.5": "small, clear, mechanical: renames, docs, config, one obvious-pattern file",
        "sonnet-5": "ordinary multi-step implementation judgment (older build)",
        "sonnet-5.5": "ordinary multi-step implementation judgment (current build)",
        "opus-5": "cross-file design judgment or genuinely tricky debugging (older build)",
        "opus-5.5": "cross-file design judgment or genuinely tricky debugging (current build)"
      }
    },
    "effort_01-add-parser": {
      "type": "choice",
      "instructions": "How much reasoning effort does the ticket at `state.tickets[0].body` need?",
      "criteria": {
        "low": "the change is spelled out",
        "medium": "ordinary",
        "high": "subtle logic or several files to keep consistent",
        "xhigh": "hard reasoning a mistake would be costly in"
      }
    }
  }
}
```
(repeated per ticket in `state.tickets`, indexed by position). Response: for each ticket, `model_<name>.choice` (one of the 5 criteria keys) is collapsed in code — `*-haiku* → haiku`, `sonnet-* → sonnet`, `opus-* → opus` — the `effort_<name>.choice` is used as-is. `confidence` from both is carried through for the `**Model (Jev):**` audit line and `--json` output, never used to discard an answer.

## `lib/jev.js` (new)

- `diagnoseJev(): { enabled, reason }` — `Boolean(process.env.TYPESAFE_API_KEY)`, reason `"TYPESAFE_API_KEY is set"` / `"TYPESAFE_API_KEY is not set"`. No network call (unlike `diagnoseGithub`'s `gh auth status`), so nothing to cache expensively — the config flag exists for user override, not for avoiding a slow check.
- `classifyTickets(tickets: [{name, body}]): { model, modelRaw, modelConfidence, effort, effortConfidence }` keyed by name, or throws a typed `JevError` on any failure (timeout/network/non-2xx/empty key) that the caller turns into a warning, never a `GpsError`.
- Model-criteria and effort-criteria text, and the family-collapse map, live as exported constants here (not duplicated in `jev-hints.js` or `plan.md`).

## `lib/project-config.js`

- `validate()`: optional `jev` object, `{ enabled: boolean }`, same treatment as `changelog`/`release` (absent → default `{ enabled: false }`, old config files keep validating).
- `createConfig()`: seeds `jev: { enabled: diagnoseJev().enabled, detected_at }` alongside `github`, at the same time.
- `rescanProjectConfig()`: generalized to re-detect and report both `github` and `jev` independently in one pass (two independent `{ status, stored, detected }` results in the return shape); hand-forcing either on/off still sticks until the next explicit `--apply`.
- New `jevEnabled(projectRoot)` reader, parallel to `githubEnabled`.
- The API key itself is **never** read from or written to `gps-config.json` — always `process.env.TYPESAFE_API_KEY` at call time.

## New script: `jev-hints.js`

```
jev-hints.js [--json]
```
No positionals. Reads ticket blocks from **stdin**, in the same `--- ticket: NN-<slug> ---` format `write-payload.js`'s `parsePayload` already parses (its block-splitting is extracted into a shared helper, e.g. `splitTicketBlocks`, that both `parsePayload` and `jev-hints.js` call — checked against "shared logic goes in lib/" before adding anything new).

- Not enabled (`jev.enabled` false, or `TYPESAFE_API_KEY` unset even though the flag says true) → text: `Jev is not enabled; use your own judgment for every ticket.`, data `{ used: false, reason, tickets: {} }`. No warning (this is the expected default state, not a failure). Exit 0.
- Enabled, call fails → one `warn()` line naming the failure, same `{ used: false, reason, tickets: {} }` shape, exit 0. `/gps plan`'s fallback logic is identical for "not configured" and "configured but failed."
- Enabled, call succeeds → text, one line per ticket: `01-add-parser: Model sonnet (sonnet-5.5, confidence 0.82) · Effort medium (confidence 0.74)`; data `{ used: true, tickets: { "01-add-parser": { model, modelRaw, modelConfidence, effort, effortConfidence }, ... } }`.
- Never a `GpsError`: this script's job is to *try* and report, not to block planning.

## `references/plan.md` step 3 (rewritten, still ≤ 40 lines)

1. Draft every ticket's content with `writing-plans` — Acceptance Criteria, Files to Touch, Verification Step, Notes — leaving Model/Effort for the next step.
2. Pipe every drafted ticket into `jev-hints.js` once (whole plan, one call).
3. For a ticket `jev-hints.js` judged: write `**Model:** <family>`, `**Model (Jev):** <raw> (confidence <n>)`, `**Effort:** <level>`. For every other ticket: apply the existing heuristic text (unchanged) for both lines, and add no `**Model (Jev):**` line.
4. Run `unslop` on each ticket, keeping all Model/Effort/Model (Jev) lines through it (existing instruction, now also covering the new line).

## `/gps config`

`config.js` output gains a `jev.enabled = <bool> (TYPESAFE_API_KEY set: yes/no)` line next to the existing GitHub line; `--rescan [--apply]` re-detects both and reports each independently (a GitHub change and a Jev change can differ in the same run).

## Ticket format (`skills/gps/assets/02-ticket.md`, `lib/ticket-model.js`)

No template change: `**Model (Jev):**` is only ever written by Claude when Jev actually judged that ticket, never a template placeholder. `MODEL_RE`/`EFFORT_RE` match the label `Model`/`Effort` exactly, so the new line is inert to `normalizeTicketModel`/`normalizeTicketEffort` and to `write-payload.js`'s validation — nothing in the existing parsing needs to change to tolerate it.

## Docs

- New `docs/decisions/0005-jev-model-effort-hints-stay-optional-and-family-level.md`: why optional (env var + config flag, mirrors GitHub); why collapsed to family (decision 0004's `Agent`-tool constraint is unchanged by adding Jev); today's rejected alternatives (raw version-pinned value; the 5×4 grid, and why it breaks Bedrock/Vertex/Foundry users) so they aren't re-proposed without this context; failure handling (warn once, fall back per-ticket, never a hard error).
- `CLAUDE.md`'s `.work/gps-config.json` line (`github.enabled`, detected once, re-detected only by `/gps config --rescan`) gets `jev.enabled` added alongside it.
- `SKILL.md` `allowed-tools`: add `Bash(node ${CLAUDE_SKILL_DIR}/scripts/jev-hints.js *)`.

## Testing

- `tests/lib/jev.test.js`: `diagnoseJev` with/without the env var; `classifyTickets` against a stubbed HTTP layer (success with multiple tickets, family-collapse mapping for all 5 criteria values, timeout, non-2xx, network error — each surfaces as `JevError`).
- `tests/lib/project-config.test.js`: `jev` section validation (absent, valid, invalid), `createConfig` seeds it, `rescanProjectConfig` reports GitHub and Jev independently (one changes, the other doesn't).
- `tests/jev-hints.test.js`: stdin ticket-block parsing (reuses the shared splitter — fenced-code safety included), not-enabled path (no warning), call-failure path (one warning), success path (per-ticket data and text), `--json`.
- `tests/skill.test.js`: new script in `allowed-tools`, `references/plan.md` still ≤ 40 lines, `docs/WORK-DIR.md` unchanged (no new `.work/` path — `gps-config.json` already exists).
- `tests/e2e.test.js`: a full `/gps plan` run with Jev unconfigured behaves exactly as before (regression guard — this is the case every existing user hits).
