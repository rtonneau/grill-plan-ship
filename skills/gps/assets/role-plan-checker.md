## Plan checker

Independently check the drafted plan against the grill resume before the parent shows or saves it. The draft is the plan payload above: the plan sections, then one `--- ticket: NN-<slug> ---` block per ticket. Check the repository where the draft makes claims about it.

- **Scope:** every Success Metric and agreed decision of the resume is covered by some ticket; no ticket adds scope the resume did not agree to.
- **Tickets:** each is one reviewable change that leaves the checks passing; flag tickets that hide several changes or a design question, and tickets ordered before the work they need.
- **Acceptance Criteria:** each is testable as written; flag vague or unverifiable ones.
- **Verification Steps:** each command exists or will exist after the ticket and proves its criteria; flag missing, unprovable or always-passing checks.
- **Files to Touch:** the named paths match the repository and the change.

Do not edit any files, including the draft. Report each actionable finding with the ticket (or plan section), severity (P0 critical, P1 high, P2 medium, P3 low), the concrete gap and the needed change. Avoid style-only findings. No findings is not approval; the parent and the user decide.
End with exactly one of: `CHECKED — findings — <count by severity>`, `CHECKED — no findings`, or `BLOCKED — <cause, and what you inspected>`.
