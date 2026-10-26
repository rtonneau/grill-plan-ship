// Tests for idea-list.js. Run: node --test tests/idea/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { runScript, setup, bodyFile } = require("./helpers");

function envFor(cfg) {
  return { GPS_IDEA_CONFIG_PATH: cfg };
}

// Runs idea-list.js and returns stdout; throws on a non-zero exit.
function run(cwd, cfg, args) {
  const r = runScript(cwd, "idea-list.js", args, envFor(cfg));
  if (r.code !== 0) throw new Error(`idea-list.js ${args.join(" ")} failed (exit ${r.code}):\n${r.err}`);
  return r.out;
}

function runJson(cwd, cfg, args) {
  return JSON.parse(run(cwd, cfg, [...args, "--json"]));
}

// idea-save.js is used here only to set up fixtures for idea-list.js to list.
function save(cwd, cfg, args) {
  const r = runScript(cwd, "idea-save.js", args, envFor(cfg));
  if (r.code !== 0) throw new Error(`idea-save.js ${args.join(" ")} failed (exit ${r.code}):\n${r.err}`);
  return r.out;
}

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

test("list: groups by status, gpsMatch from a gps session, --all adds closed Ideas", () => {
  const { cfg, repo } = setup();
  const sessionDir = path.join(repo, ".work", "sessions", "2026-10-05__x");
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(
    path.join(sessionDir, ".session-config.json"),
    JSON.stringify({ session_id: "2026-10-05__x", feature_name: "x", current_phase: "ship" }),
  );
  save(repo, cfg, ["x", "--action", "grill", "--body-file", bodyFile("b\n")]);
  save(repo, cfg, ["a", "--action", "capture"]);
  save(repo, cfg, ["d", "--action", "capture"]);
  save(repo, cfg, ["d", "--action", "drop", "--event", "not needed"]);
  save(repo, cfg, ["g", "--action", "capture", "--global"]);

  const l = runJson(repo, cfg, []);
  assert.deepEqual(
    l.project.map((e) => [e.slug, e.status, e.gpsMatch]),
    [["a", "captured", null], ["x", "grilled", "2026-10-05__x"]],
  );
  assert.deepEqual(Object.keys(l.project[0]).sort(), ["created", "gpsMatch", "path", "reviews", "slug", "status"]);
  assert.equal(l.project[0].created, today());
  assert.equal(l.project[0].reviews, 0);
  assert.equal(l.project[0].path, path.join(repo, ".work", "idea", "a.md"));
  assert.deepEqual(l.global.map((e) => e.slug), ["g"]);

  const all = runJson(repo, cfg, ["--all"]);
  assert.deepEqual(all.project.map((e) => [e.slug, e.status]), [["a", "captured"], ["x", "grilled"], ["d", "dropped"]]);

  save(repo, cfg, ["x", "--action", "promote", "--promoted-to", "repo:2026-10-05__x"]);
  const after = runJson(repo, cfg, ["--all"]);
  const x = after.project.find((e) => e.slug === "x");
  assert.equal(x.status, "promoted");
  assert.equal(x.gpsMatch, null);

  const human = run(repo, cfg, []);
  assert.match(human, /^Project /m);
  assert.match(human, /^Global /m);
});
