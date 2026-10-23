"use strict";
// Test helpers: throwaway git repos under the OS temp dir, and running the
// idea scripts themselves as subprocesses. Tests never touch the real repo.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");

const SCRIPTS = path.join(__dirname, "..", "..", "skills", "idea", "scripts");

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

// Runs scripts/<script> in `cwd`: { code, out, err }.
function run(cwd, script, args = [], env = {}) {
  const result = spawnSync(process.execPath, [path.join(SCRIPTS, script), ...args], {
    cwd, encoding: "utf8", env: { ...process.env, ...env },
  });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

// Runs a script that must succeed; returns its result.
function ok(cwd, script, args = [], env = {}) {
  const res = run(cwd, script, args, env);
  assert.equal(res.code, 0, `${script} ${args.join(" ")} failed (exit ${res.code}):\n${res.err}`);
  return res;
}

// Runs a script with --json that must succeed; returns its parsed data.
function json(cwd, script, args = [], env = {}) {
  return JSON.parse(ok(cwd, script, [...args, "--json"], env).out);
}

function tmpDir(prefix = "idea-") {
  return fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

function makeRepo({ branch = "main", remote = false } = {}) {
  const dir = tmpDir();
  git(dir, ["init", "-q", "-b", branch]);
  git(dir, ["config", "user.name", "Test"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "commit.gpgsign", "false"]);
  git(dir, ["commit", "-q", "--allow-empty", "-m", "init"]);
  if (remote) {
    const bare = tmpDir("idea-remote-");
    git(bare, ["init", "-q", "--bare", "-b", branch]);
    git(dir, ["remote", "add", "origin", bare]);
    git(dir, ["push", "-q", "origin", branch]);
    git(dir, ["remote", "set-head", "origin", branch]);
  }
  return dir;
}

// Same shape as run(): { code, out, err }. A distinct name for the five idea
// action scripts' tests, each of which sets GPS_IDEA_CONFIG_PATH per call via
// `env` (the file a repo's `globalRoot` is read from — see lib/scope.js) the
// same way the old dotfiles-based tests set IDEA_DOTFILES_ROOT per call.
const runScript = run;

// A project repo (with .work/) plus a separate repo configured as the Global
// root (with .work/), and a GPS_IDEA_CONFIG_PATH-style config file naming it.
// Every idea script test that needs a Global scope to exist builds on this.
function setup() {
  const globalRoot = makeRepo();
  fs.mkdirSync(path.join(globalRoot, ".work"));
  const cfg = path.join(tmpDir(), "idea-config.json");
  fs.writeFileSync(cfg, JSON.stringify({ globalRoot }));
  const repo = makeRepo();
  fs.mkdirSync(path.join(repo, ".work"));
  return { cfg, repo, globalRoot };
}

// Writes `text` to a fresh tmp file, for scripts' --body-file flag.
function bodyFile(text) {
  const file = path.join(tmpDir("idea-body-"), "body.md");
  fs.writeFileSync(file, text);
  return file;
}

// Commit subjects in `repo`, newest first.
function subjects(repo) {
  return git(repo, ["log", "--format=%s"]).trim().split("\n");
}

module.exports = { makeRepo, git, tmpDir, run, ok, json, runScript, setup, bodyFile, subjects };
