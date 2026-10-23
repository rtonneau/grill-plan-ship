// Tests for idea-resolve.js. Run: node --test tests/idea/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { runScript, setup } = require("./helpers");

function envFor(cfg) {
  return { GPS_IDEA_CONFIG_PATH: cfg };
}

// Runs idea-resolve.js and returns stdout; throws on a non-zero exit.
function run(cwd, cfg, args) {
  const r = runScript(cwd, "idea-resolve.js", args, envFor(cfg));
  if (r.code !== 0) throw new Error(`idea-resolve.js ${args.join(" ")} failed (exit ${r.code}):\n${r.err}`);
  return r.out;
}

function runJson(cwd, cfg, args) {
  return JSON.parse(run(cwd, cfg, [...args, "--json"]));
}

test("resolve: prints the scope object", () => {
  const { cfg, repo, globalRoot } = setup();
  const p = runJson(repo, cfg, []);
  assert.equal(p.scope, "project");
  assert.equal(p.ideaDir, path.join(repo, ".work", "idea"));
  assert.equal(p.workDirExists, true);
  assert.equal(p.globalDir, path.join(globalRoot, ".work", "idea", "global"));
  const g = runJson(repo, cfg, ["--global"]);
  assert.equal(g.scope, "global");
  assert.equal(g.gitRoot, globalRoot);
  assert.match(run(repo, cfg, []), /^scope: project$/m);
});
