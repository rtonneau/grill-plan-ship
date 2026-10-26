// Tests for idea-save.js. Run: node --test tests/idea/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { makeRepo, tmpDir, git, runScript, setup, bodyFile, subjects } = require("./helpers");
const { parseIdea } = require("../../skills/idea/scripts/lib/idea-file");

function envFor(cfg) {
  return { GPS_IDEA_CONFIG_PATH: cfg };
}

// Runs idea-save.js and returns stdout; throws on a non-zero exit.
function run(cwd, cfg, args) {
  const r = runScript(cwd, "idea-save.js", args, envFor(cfg));
  if (r.code !== 0) throw new Error(`idea-save.js ${args.join(" ")} failed (exit ${r.code}):\n${r.err}`);
  return r.out;
}

function runJson(cwd, cfg, args) {
  return JSON.parse(run(cwd, cfg, [...args, "--json"]));
}

// Runs idea-save.js and returns { status, stdout, stderr } whatever the exit code.
function runRaw(cwd, cfg, args) {
  const r = runScript(cwd, "idea-save.js", args, envFor(cfg));
  return { status: r.code, stdout: r.out, stderr: r.err };
}

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

test("save: capture → grill → plan → review → promote", () => {
  const { cfg, repo } = setup();
  const file = path.join(repo, ".work", "idea", "fast-io.md");

  const cap = runJson(repo, cfg, ["fast-io", "--action", "capture", "--event", "speed up output"]);
  assert.equal(cap.path, file);
  assert.equal(cap.status, "captured");
  assert.match(cap.sha, /^[0-9a-f]{40}$/);
  let idea = parseIdea(fs.readFileSync(file, "utf8"));
  assert.equal(idea.body, "## Problem\n\nspeed up output");
  assert.deepEqual(idea.meta, { status: "captured", scope: "project", created: today(), reviews: 0, promoted_to: null });
  assert.equal(idea.changelog[0].text, `capture — speed up output (${path.basename(repo)} @ main)`);

  run(repo, cfg, ["fast-io", "--action", "grill", "--body-file", bodyFile("## Problem\n\ngrilled\n")]);
  run(repo, cfg, ["fast-io", "--action", "plan", "--body-file", bodyFile("## Problem\n\nplanned\n")]);
  const rev = runJson(repo, cfg, [
    "fast-io", "--action", "review", "--body-file", bodyFile("## Problem\n\nreviewed\n"), "--event", "still valid",
  ]);
  assert.equal(rev.reviews, 1);
  const out = run(repo, cfg, ["fast-io", "--action", "promote", "--promoted-to", "proj:2026-10-05__fast-io"]);
  assert.match(out, new RegExp(`^${file.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")}$`, "m"));
  assert.match(out, /^committed [0-9a-f]{40}/m);

  idea = parseIdea(fs.readFileSync(file, "utf8"));
  assert.equal(idea.meta.status, "promoted");
  assert.equal(idea.meta.reviews, 1);
  assert.equal(idea.meta.promoted_to, "proj:2026-10-05__fast-io");
  assert.equal(idea.body, "## Problem\n\nreviewed");
  assert.deepEqual(
    idea.changelog.map((e) => e.text),
    [`capture — speed up output (${path.basename(repo)} @ main)`, "grill", "plan", "review — still valid", "promote"],
  );
  assert.ok(idea.changelog.every((e) => e.date === today()));
  assert.deepEqual(subjects(repo).slice(0, 5), [
    "idea(fast-io): promote",
    "idea(fast-io): review 1",
    "idea(fast-io): plan",
    "idea(fast-io): grill",
    "idea(fast-io): capture",
  ]);
  assert.equal(subjects(repo).length, 6);
  assert.equal(git(repo, ["status", "--porcelain"]).trim(), "");
});

test("save: a captured slug can be grilled", () => {
  const { cfg, repo } = setup();
  run(repo, cfg, ["x", "--action", "capture"]);
  const r = runJson(repo, cfg, ["x", "--action", "grill", "--body-file", bodyFile("## Problem\n\np\n")]);
  assert.equal(r.status, "grilled");
});

test("save: a planned slug refuses capture and grill, writing nothing", () => {
  const { cfg, repo } = setup();
  const file = path.join(repo, ".work", "idea", "x.md");
  run(repo, cfg, ["x", "--action", "grill", "--body-file", bodyFile("b\n")]);
  run(repo, cfg, ["x", "--action", "plan", "--body-file", bodyFile("b\n")]);
  const before = fs.readFileSync(file, "utf8");
  for (const args of [["--action", "capture"], ["--action", "grill", "--body-file", bodyFile("c\n")]]) {
    const r = runRaw(repo, cfg, ["x", ...args]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /^❌ /);
    assert.match(r.stderr, /planned/);
    assert.ok(r.stderr.includes(file));
  }
  assert.equal(fs.readFileSync(file, "utf8"), before);
  assert.equal(subjects(repo).length, 3);
});

test("save: invalid transition and missing body file exit 1", () => {
  const { cfg, repo } = setup();
  let r = runRaw(repo, cfg, ["x", "--action", "plan", "--body-file", bodyFile("b\n")]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /❌ cannot plan a none Idea/);
  for (const action of ["grill", "plan", "review"]) {
    r = runRaw(repo, cfg, ["x", "--action", action]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /--body-file is required/);
  }
  assert.equal(fs.existsSync(path.join(repo, ".work", "idea")), false);
});

test("save: usage errors exit 2", () => {
  const { cfg, repo } = setup();
  assert.equal(runRaw(repo, cfg, ["x"]).status, 2);
  assert.equal(runRaw(repo, cfg, ["x", "--action", "bogus"]).status, 2);
  assert.equal(runRaw(repo, cfg, ["x", "--action", "capture", "--nope"]).status, 2);
  assert.equal(runRaw(repo, cfg, ["x", "--action", "promote"]).status, 2);
  assert.equal(runRaw(repo, cfg, ["global", "--action", "capture"]).status, 1);
});

test("save: missing .work/ is refused, then --create-work-dir succeeds", () => {
  const cfg = path.join(tmpDir(), "idea-config.json");
  const repo = makeRepo();
  const r = runRaw(repo, cfg, ["x", "--action", "capture", "--event", "n"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^❌ \.work\/ is missing/);
  assert.match(r.stderr, /--create-work-dir/);
  assert.match(r.stderr, /--global/);
  assert.equal(fs.existsSync(path.join(repo, ".work")), false);

  const ok = runJson(repo, cfg, ["x", "--action", "capture", "--event", "n", "--create-work-dir"]);
  assert.equal(ok.path, path.join(repo, ".work", "idea", "x.md"));
  assert.ok(fs.existsSync(ok.path));
  assert.equal(subjects(repo)[0], "idea(x): capture");
});

test("save --global from an unrelated repo writes under the configured global root", () => {
  const { cfg, repo, globalRoot } = setup();
  const r = runJson(repo, cfg, ["g-idea", "--action", "capture", "--global", "--event", "global note"]);
  const file = path.join(globalRoot, ".work", "idea", "global", "g-idea.md");
  assert.equal(r.path, file);
  const idea = parseIdea(fs.readFileSync(file, "utf8"));
  assert.equal(idea.meta.scope, "global");
  assert.equal(idea.changelog[0].text, `capture — global note (${path.basename(repo)} @ main)`);
  assert.equal(subjects(globalRoot)[0], "idea(g-idea): capture");
  assert.equal(subjects(repo).length, 1);
  assert.equal(fs.existsSync(path.join(repo, ".work", "idea")), false);

  const foundRes = runScript(repo, "idea-find.js", ["g-idea", "--json"], envFor(cfg));
  assert.equal(foundRes.code, 0);
  const found = JSON.parse(foundRes.out);
  assert.deepEqual(found, { project: null, global: { status: "captured", path: file } });
});

test("save: capture outside a repo records (no repo) and skips the commit", () => {
  const cfg = path.join(tmpDir(), "idea-config.json");
  const dir = tmpDir();
  const r = runJson(dir, cfg, ["x", "--action", "capture", "--create-work-dir"]);
  assert.equal(r.sha, null);
  assert.ok(r.skipped);
  assert.equal(parseIdea(fs.readFileSync(r.path, "utf8")).changelog[0].text, "capture (no repo)");
});
