#!/usr/bin/env node

/**
 * npm test
 *
 * Runs every scripts/**\/*.test.js file with Node's built-in test runner
 * (node --test), passing the files explicitly so the same command works on
 * Node 20 and 22 and never picks up copies of the repo elsewhere (e.g.
 * .claude/worktrees/). Each test file is a plain assert script: it passes
 * when it exits with code 0.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function findTests(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return findTests(full);
    return entry.name.endsWith('.test.js') ? [full] : [];
  });
}

const files = findTests(__dirname).sort();
if (files.length === 0) {
  console.error('❌ No test files found under scripts/.');
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(result.status === null ? 1 : result.status);
