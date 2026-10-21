#!/usr/bin/env node

/**
 * idea-config.js [--json]                           show the configured Global root
 * idea-config.js --set-global-root <path> [--json]   validate and remember it
 *
 * Global-scope Ideas have no repo of their own: the user names a personal git
 * repo once here, remembered in a small per-user file (see lib/scope.js).
 */

const { main } = require('./lib/cli');
const { readGlobalConfig, writeGlobalConfig } = require('./lib/scope');

main({
  usage: 'idea-config.js [--set-global-root <path>] [--json]',
  positionals: { min: 0, max: 0 },
  options: { 'set-global-root': 'string' },
  run({ options }) {
    if (options['set-global-root']) {
      const { globalRoot } = writeGlobalConfig({ globalRoot: options['set-global-root'] });
      return { text: `global root set to ${globalRoot}`, data: { globalRoot } };
    }
    const { globalRoot } = readGlobalConfig();
    return {
      text: globalRoot ? `global root: ${globalRoot}` : 'global root: not configured',
      data: { globalRoot },
    };
  },
});
