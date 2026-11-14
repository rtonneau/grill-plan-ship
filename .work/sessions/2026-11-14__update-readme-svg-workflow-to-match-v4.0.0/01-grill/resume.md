# Session: update readme svg workflow to match v4.0.0

**Date:** 2026-11-14T22:02:36.265Z
**Status:** Grill phase complete

## Problem Statement

The README workflow diagram (`docs/gps-workflow.png`, rendered from `docs/gps-workflow.svg` on `design-sources`) still showed v2.7.0 behavior. It needed to match v4.0.0.

## Context & Constraints

- **Current behavior:** The diagram was titled v2.7.0. It showed Jev-judged hints as part of plan, model names `haiku|sonnet|opus`, "unslop each ticket", no sizing, no `--worktree`, no reviewer step, no changelog step in finish and no `/gps release`.
- **Pain point:** The README showed a workflow that no longer matched the commands and references.
- **Dependencies:** The SVG source lives only on `design-sources` (no SVG on main); main carries the PNG only.
- **Tech stack:** Hand-edited SVG, rendered to a 2400x2520 PNG with headless Chrome at 1.5x.

## Success Metrics

- Title and description read v4.0.0.
- GRILL, PLAN, SHIP, FINISH and ANYTIME/AUTO content matches `skills/gps/references/*.md`.
- The PNG keeps the 2400x2520 size and the README embed works unchanged.

## Architecture & Approach

Edit the SVG on `design-sources` through a script of exact string replacements, then render the PNG and commit it on main. Layout and styling stay as they were.

## Assumptions & Trade-offs

Jev stays shown as optional. No pushes were made. The SVG commit on `design-sources` is separate from the PNG commit.

## Open Questions

None.

## Notes

Commits: PNG on `docs/workflow-diagram-v4` (main-based), SVG on `design-sources`.
