#!/usr/bin/env node

/**
 * idea-resolve.js [--global] [--json]
 *
 * Prints the resolved scope for the current directory: where Ideas live
 * (project .work/idea, or the configured Global root's .work/idea/global),
 * and the git context used to compute it.
 */

const { main } = require('./lib/cli');
const { resolveScope, readGlobalConfig } = require('./lib/scope');

main({
  usage: 'idea-resolve.js [--global] [--json]',
  positionals: { min: 0, max: 0 },
  options: { global: 'boolean' },
  run({ options, projectRoot }) {
    const { globalRoot } = readGlobalConfig();
    const s = resolveScope({ cwd: projectRoot, global: !!options.global, globalRoot });
    const text = [
      `scope: ${s.scope}`,
      `ideaDir: ${s.ideaDir}`,
      `gitRoot: ${s.gitRoot === null ? '(none)' : s.gitRoot}`,
      `workDirExists: ${s.workDirExists}`,
      `branch: ${s.branch === null ? '(none)' : s.branch}`,
      `defaultBranch: ${s.defaultBranch === null ? '(none)' : s.defaultBranch}`,
      `offDefaultBranch: ${s.offDefaultBranch}`,
      `globalDir: ${s.globalDir === null ? '(none)' : s.globalDir}`,
    ].join('\n');
    return { text, data: s };
  },
});
