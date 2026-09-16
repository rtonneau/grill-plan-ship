# Task 1: Vendor the `templates/` directory

**Files:**
- Create: `templates/01-grill-resume.md`
- Create: `templates/02-plan.md`
- Create: `templates/02-ticket.md`
- Create: `templates/03-implement-log.md`
- Test: manual (`Step 6` below exercises these files end-to-end)

**Interfaces:**
- Produces: four on-disk markdown files under `templates/`, each with `{{ key }}`-style placeholders, consumed by `scripts/lib/templates.js` (Task 2) via `loadTemplate(fileName)`.

- [ ] **Step 1: Create `templates/01-grill-resume.md`**

```markdown
# Session: {{ feature-name }}

**Date:** {{ timestamp }}
**Status:** Grill phase complete

## Problem Statement

{{ What are we solving? What's broken or missing? }}

## Context & Constraints

- **Current behavior:** {{ How does it work now? }}
- **Pain point:** {{ What's the issue? }}
- **Dependencies:** {{ What must we keep/change? }}
- **Tech stack:** {{ Relevant libraries, frameworks }}

## Success Metrics

- {{ Clear, testable criterion 1 }}
- {{ Criterion 2 }}
- {{ Criterion 3 }}

## Architecture & Approach

{{ Proposed solution at a high level }}

## Assumptions & Trade-offs

{{ What are we assuming? What are we NOT doing? }}

## Open Questions

{{ Any unresolved questions or uncertainties? }}

## Notes

{{ Additional notes or observations from the grill phase }}
```

- [ ] **Step 2: Create `templates/02-plan.md`**

```markdown
# Implementation Plan

**Session:** {{ feature-name }}
**Date:** {{ timestamp }}
**Estimated effort:** {{ N hours/days }}

## Strategy

{{ High-level approach: what's the sequence? Why this order? Any blockers? }}

## Tickets Overview

- **Ticket 1:** {{ What does it accomplish? }}
- **Ticket 2:** {{ }}
- **Ticket 3:** {{ }}
- **Ticket 4:** {{ }}

## Sequencing Rationale

{{ Why this order? Dependencies? }}

## Risks & Mitigation

- **Risk:** {{ }} -> **Mitigation:** {{ }}

## Assumptions

- {{ Assumptions about dependencies, environment, or constraints }}
```

- [ ] **Step 3: Create `templates/02-ticket.md`**

````markdown
# Ticket {{ N }}: {{ slug }}

**Acceptance Criteria:**
- [ ] {{ Criterion 1 (testable) }}
- [ ] {{ Criterion 2 (testable) }}
- [ ] {{ Criterion 3 (testable) }}

**Files to Touch:**
- `{{ path }}`
- `{{ path }}`

**Verification Step:**

Run:
```bash
{{ command }}
```

Expected:
{{ output }}

**Notes:**

{{ Anything Claude Code should know before implementing }}
````

- [ ] **Step 4: Create `templates/03-implement-log.md`**

````markdown
# Ticket {{ N }} Implementation

**Status:** In Progress / Done

## Commits

- {{ commit hash }} {{ message }}

## Local Test Result

```
{{ test output }}
```

## Review Notes

{{ Any findings during self-review }}

## Time Spent

{{ ~X hours }}

## Blockers / Challenges

{{ Any issues encountered during implementation }}
````

- [ ] **Step 5: Commit**

```bash
git add templates/
git commit -m "docs: vendor markdown templates used by gps scripts"
```
