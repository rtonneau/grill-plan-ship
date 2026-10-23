// Tests for idea-promote-check.js. Run: node --test tests/idea/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { runScript, setup } = require("./helpers");

function envFor(cfg) {
  return { GPS_IDEA_CONFIG_PATH: cfg };
}

// Runs idea-promote-check.js and returns stdout; throws on a non-zero exit.
function run(cwd, cfg, args) {
  const r = runScript(cwd, "idea-promote-check.js", args, envFor(cfg));
  if (r.code !== 0) throw new Error(`idea-promote-check.js ${args.join(" ")} failed (exit ${r.code}):\n${r.err}`);
  return r.out;
}

function runJson(cwd, cfg, args) {
  return JSON.parse(run(cwd, cfg, [...args, "--json"]));
}

test("promote-check: reads feature_name and current_phase", () => {
  const { cfg, repo } = setup();
  const sessionDir = path.join(repo, ".work", "sessions", "2026-10-05__x");
  fs.mkdirSync(sessionDir, { recursive: true });
  const sessionCfg = path.join(sessionDir, ".session-config.json");
  fs.writeFileSync(sessionCfg, JSON.stringify({ feature_name: "x", current_phase: "grill" }));
  const before = fs.readFileSync(sessionCfg, "utf8");
  assert.deepEqual(runJson(repo, cfg, ["2026-10-05__x"]), {
    exists: true, featureName: "x", currentPhase: "grill", grillSaved: false,
  });
  assert.equal(fs.readFileSync(sessionCfg, "utf8"), before);
  fs.writeFileSync(sessionCfg, JSON.stringify({ feature_name: "x", current_phase: "plan-not-started" }));
  assert.deepEqual(runJson(repo, cfg, ["2026-10-05__x"]), {
    exists: true, featureName: "x", currentPhase: "plan-not-started", grillSaved: true,
  });
  assert.match(run(repo, cfg, ["2026-10-05__x"]), /grill saved/);
  assert.deepEqual(runJson(repo, cfg, ["nope"]), {
    exists: false, featureName: null, currentPhase: null, grillSaved: false,
  });
  assert.deepEqual(fs.readdirSync(sessionDir), [".session-config.json"]);
});
