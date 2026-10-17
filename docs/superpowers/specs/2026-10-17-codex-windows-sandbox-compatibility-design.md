# Codex Windows Sandbox Compatibility Design

## Problem

GPS 2.8.3 can fail during an otherwise valid Codex shipping session on Windows. Updating an existing `.session-config.json` writes a sibling temporary file and calls `fs.renameSync(temp, destination)`. A Codex workspace sandbox may permit writes to both files but deny replacement-by-rename with `EPERM`, so `ticket-start.js` exits after partially preparing the ticket workspace.

At GPS startup, a Codex agent also tried to load shared instructions with PowerShell. The machine's global `C:\Users\rtonneau\.codex\AGENTS.md`, created by Codex's Claude-import migration, contained the literal Claude-style import `@~/dotfiles/claude/COMMON_CLAUDE.md`; it therefore appeared in every project's context without its target content. The agent resolved the correct absolute `C:\Users\rtonneau\dotfiles\claude\COMMON_CLAUDE.md` path, but the workspace sandbox denied that shell read. PowerShell then printed both `Access is denied` and a secondary `PathNotFound`; the UI's ellipsis made the path look truncated. The target repository cwd did not participate in resolution. GPS scripts do not parse `AGENTS.md`; the mitigation belongs in Codex configuration and setup guidance.

## Requirements

- Support Node.js 20+ on Windows and retain dependency-free CommonJS code.
- Keep temporary-file-plus-rename as the normal write path.
- When replacement rename is denied with Windows-style `EPERM` or `EACCES`, complete the requested write through a sandbox-compatible fallback and remove the temporary file.
- Do not hide unrelated rename errors, and do not leave temporary files after either a successful normal write or a successful fallback.
- Use one shared file-replacement primitive for JSON state, changelog fragments, and release version files so they cannot drift into separate Windows behaviors.
- Preserve existing serialization exactly: `writeJsonAtomic` has no trailing newline; changelog fragments and version files retain their current content and newline rules.
- Add regression coverage that simulates denied replacement without depending on the test runner itself being sandboxed.
- Pressure-test whether the current GPS router causes a fresh Codex agent to reread instruction content already supplied in conversation; add router wording only if the no-guidance control reproduces that behavior.
- Document that `~/.codex/AGENTS.md` is global across projects, Claude-style imports such as `@~/...` may remain literal in Codex, and a sandboxed attempt to compensate with a shell read may fail even when the path is correct.
- Keep `skills/gps/SKILL.md` below 100 lines and reference files at or below 40 lines.

## Non-goals

- Bypassing the Codex sandbox or requesting broad filesystem permissions.
- Promising full crash atomicity for the direct-write fallback; it exists only when the host denies atomic replacement.
- Implementing an `AGENTS.md` parser or resolving user-home imports inside GPS.
- Changing session state formats, command output, or delegation semantics.

## Acceptance

On a simulated `EPERM`/`EACCES` replacement failure, overwriting an existing session config succeeds, contains the new valid JSON, and leaves no `.tmp-*` file. Normal rename behavior remains covered, non-permission errors propagate after cleanup, all replacement callers use the shared helper, skill/documentation tests pin the Codex instruction-loading rule, and the full test suite plus skill-size check pass.
