// Tests for idea-find.js. Run: node --test tests/idea/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { runScript, setup } = require("./helpers");

function envFor(cfg) {
  return { GPS_IDEA_CONFIG_PATH: cfg };
}

// Runs idea-find.js and returns stdout; throws on a non-zero exit.
function run(cwd, cfg, args) {
  const r = runScript(cwd, "idea-find.js", args, envFor(cfg));
  if (r.code !== 0) throw new Error(`idea-find.js ${args.join(" ")} failed (exit ${r.code}):\n${r.err}`);
  return r.out;
}

function runJson(cwd, cfg, args) {
  return JSON.parse(run(cwd, cfg, [...args, "--json"]));
}

// Runs idea-find.js and returns { status, stdout, stderr } whatever the exit code.
function runRaw(cwd, cfg, args) {
  const r = runScript(cwd, "idea-find.js", args, envFor(cfg));
  return { status: r.code, stdout: r.out, stderr: r.err };
}

// idea-save.js is used here only to set up fixtures for idea-find.js to find.
function save(cwd, cfg, args) {
  const r = runScript(cwd, "idea-save.js", args, envFor(cfg));
  if (r.code !== 0) throw new Error(`idea-save.js ${args.join(" ")} failed (exit ${r.code}):\n${r.err}`);
  return r.out;
}

test("find: searches both scopes", () => {
  const { cfg, repo, globalRoot } = setup();
  assert.deepEqual(runJson(repo, cfg, ["x"]), { project: null, global: null });
  save(repo, cfg, ["x", "--action", "capture"]);
  save(repo, cfg, ["x", "--action", "capture", "--global"]);
  assert.deepEqual(runJson(repo, cfg, ["x"]), {
    project: { status: "captured", path: path.join(repo, ".work", "idea", "x.md") },
    global: { status: "captured", path: path.join(globalRoot, ".work", "idea", "global", "x.md") },
  });
  assert.match(run(repo, cfg, ["x"]), /^project: captured /m);
});

test("find: missing slug is a usage error", () => {
  const { cfg, repo } = setup();
  assert.equal(runRaw(repo, cfg, []).status, 2);
});
