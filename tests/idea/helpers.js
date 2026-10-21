"use strict";
// Test helpers: throwaway git repos under the OS temp dir. Tests never touch the real repo.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
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

module.exports = { makeRepo, git, tmpDir };
