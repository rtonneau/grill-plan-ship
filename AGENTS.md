# Repository Guidelines

## Project Structure & Module Organization

This repository contains a Claude Code plugin with dependency-free Node.js scripts. `.claude-plugin/` holds plugin and marketplace metadata. `skills/gps/SKILL.md` routes commands; `skills/gps/references/` documents their workflows. Deterministic operations live in `skills/gps/scripts/`, with shared helpers in `scripts/lib/` and Markdown templates in `skills/gps/assets/`. `agents/` contains ticket agent definitions. Tests mirror scripts in `tests/` and helpers in `tests/lib/`. Architecture decisions and image assets live in `docs/`.

## Build, Test, and Development Commands

Use Node.js 20+ and Git. GitHub integration also requires authenticated `gh`. There are no dependencies to install or build step.

- `npm test`: run all `tests/**/*.test.js` through Node's built-in test runner.
- `node --test tests/status.test.js`: run a focused test file.
- `node --check skills/gps/scripts/status.js`: check JavaScript syntax.
- `node tests/check-skill-size.js --max 200`: enforce the CI limit for skill documents.
- `node skills/gps/scripts/help.js --help`: inspect a script's usage locally.

CI checks syntax and tests on Windows with Node 20 and 22, plus skill size on Linux.

## Coding Style & Naming Conventions

Follow existing CommonJS JavaScript: two-space indentation, single quotes, semicolons, `const` by default, and camelCase identifiers. Use kebab-case filenames such as `ticket-complete.js`. Keep command wrappers small and shared logic in `scripts/lib/`. No formatter or linter is configured; Git normalizes text to LF.

Preserve the shared CLI contract: `--help`, `--json`, user-facing stdout, warnings/errors on stderr, and exit codes 0 (success), 1 (failure), and 2 (usage error).

## Testing Guidelines

Use Node assertions and name tests `<module>.test.js`. Reuse `tests/helpers.js` for temporary projects and drive session transitions through scripts. Stub network calls using fixtures. Cover changed behavior, failure paths, and JSON output where applicable. No numeric coverage threshold is configured; run the full suite before submitting.

## Commit & Pull Request Guidelines

History uses Conventional Commit prefixes such as `refactor:`, `docs:`, and `chore(gps):`; releases use `chore(release): <version>`. Keep commits focused. PR descriptions should explain the behavior change, link relevant issues, and report validation. Update command references when workflows change and record architectural decisions in `docs/decisions/`.
