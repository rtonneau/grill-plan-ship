# grill-plan-ship glossary

A workflow plugin for Claude Code and Codex that takes a piece of work through grill, plan, ship and finish, with scripts doing every deterministic step.

<!-- Format adapted from mattpocock-skills' domain-modeling (GLOSSARY-FORMAT.md): https://github.com/mattpocock/skills.git -->

<!--
How to add a term (the moment it is resolved, not in a batch at the end):

**Term**:
One or two sentences: what it IS, not what it does.
_Avoid_: the other words people use for it

- Be opinionated: one word per concept; list the others under _Avoid_.
- Only terms specific to this project. General programming concepts and
  implementation details don't belong here: this is a glossary, not a spec.
- Group terms under "### <area>" subheadings once natural clusters emerge.
-->

## Language

**Chained finish**:
A `/gps finish` the user did not type, run automatically after `/gps ship` (with `ship.autoFinish` on) or by `/gps auto`. It asks nothing and uses the defaults (keep the issue open, no session switch).
_Avoid_: auto-finish (that is the setting, not the run)
