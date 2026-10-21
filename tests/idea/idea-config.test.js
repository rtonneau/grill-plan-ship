// Tests for idea-config.js. Run: node --test tests/idea/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { makeRepo, tmpDir, run, ok, json } = require("./helpers");

function envFor(cfg) {
  return { GPS_IDEA_CONFIG_PATH: cfg };
}

test("idea-config.js: shows 'not configured' with no config file", () => {
  const cfg = path.join(tmpDir(), "idea-config.json");
  const res = ok(tmpDir(), "idea-config.js", [], envFor(cfg));
  assert.match(res.out, /global root: not configured/);
  assert.deepEqual(json(tmpDir(), "idea-config.js", [], envFor(cfg)), { globalRoot: null });
});

test("idea-config.js --set-global-root <path>: writes the config, --json reflects it", () => {
  const repo = makeRepo();
  const cfg = path.join(tmpDir(), "idea-config.json");
  const res = ok(tmpDir(), "idea-config.js", ["--set-global-root", repo], envFor(cfg));
  assert.match(res.out, new RegExp(`global root set to ${repo.replace(/[\\/]/g, "[\\\\/]")}`));
  assert.ok(fs.existsSync(cfg));
  assert.deepEqual(JSON.parse(fs.readFileSync(cfg, "utf8")), { globalRoot: repo });
  assert.deepEqual(json(tmpDir(), "idea-config.js", [], envFor(cfg)), { globalRoot: repo });
});

test("idea-config.js --set-global-root <path>: refuses a non-repository path, writes nothing", () => {
  const notRepo = tmpDir();
  const cfg = path.join(tmpDir(), "idea-config.json");
  const res = run(tmpDir(), "idea-config.js", ["--set-global-root", notRepo], envFor(cfg));
  assert.equal(res.code, 1);
  assert.match(res.err, /Not a git repository/);
  assert.ok(!fs.existsSync(cfg));
});

test("idea-config.js: a later call with no flag reads back what was set", () => {
  const repo = makeRepo();
  const cfg = path.join(tmpDir(), "idea-config.json");
  ok(tmpDir(), "idea-config.js", ["--set-global-root", repo], envFor(cfg));
  const res = ok(tmpDir(), "idea-config.js", [], envFor(cfg));
  assert.match(res.out, new RegExp(`global root: ${repo.replace(/[\\/]/g, "[\\\\/]")}`));
});
