# Idea: type-check the gps scripts without a build step

Question raised: would converting the .js scripts to another language improve anything?

Conclusion: no rewrite. Scripts are short-lived, I/O-bound (git/gh calls, small JSON files), so performance is irrelevant. The plugin ships as plain files for Claude Code and Codex, and the scripts run with only Node (built-ins, zero dependencies). A compiled language would need per-platform binaries and a release pipeline, and the whole test suite and the lib/cli.js contract would have to be ported.

Possible improvement: JSDoc annotations plus `tsc --checkJs --noEmit` in CI. It catches wrong option names and malformed `{ text, data }` returns without changing runtime or distribution. Real TypeScript would need a build step or Node type stripping (recent Node only), so it is not worth it unless strict types are wanted badly.

Reconsider only if a standalone CLI without Node is wanted, or the scripts become CPU-heavy.
