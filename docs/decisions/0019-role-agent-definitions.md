# 0019: Role agent definitions add enforced tool limits on Claude

## Context

Decision 0016 gave each behavioral role a shared brief and rejected host agent definitions, so role restrictions were instructions only. Claude Code plugins can bundle agents (`agents/` is auto-discovered) whose `disallowedTools` the host enforces; Codex plugins cannot bundle agents, and its `spawn_agent` takes no agent type (`docs/COMPATIBILITY.md`).

## Decision

- **One Claude plugin agent per role** (`agents/gps-<role>.md`), listed in `ROLES` (`lib/host-dispatch.js`). Its frontmatter holds a name, a description that limits it to gps-dispatched briefs, and `disallowedTools`; its body only points at the brief. No model or effort: both stay per call (0014).
- **The brief stays in the prompt** on both hosts, from `dispatch-prompt.js`, so role text cannot drift between hosts or between a definition and its template.
- **Read-only roles** disallow Edit, Write, NotebookEdit and Agent; the implementer disallows Agent. Bash stays for git, so a write through Bash is still forbidden only by the brief.
- **Fallback:** when the agent type is unavailable (plugin not loaded), the parent spawns `general-purpose` with the same prompt and tells the user the limits are behavioral.
- Codex keeps receiving the brief alone.

## Alternatives rejected

- **Full role text in the agent body:** duplicates the templates and splits the hosts' text.
- **No Bash for read-only roles:** the parent would paste whole diffs into the prompt.
- **Codex custom agents installed into the project:** not bundleable by a plugin; gps would write host config outside `.work/`.

## Consequences

Supersedes only 0016's "no agent definitions" line; its shared briefs, parent ownership and bounded recovery stand. `tests/skill.test.js` keeps `agents/` and `ROLES` in step.
