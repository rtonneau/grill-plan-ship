"use strict";
// Thin git wrappers for the idea skill. execFileSync without a shell; never pushes.

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

// Find the worktree that contains `root` without asking git first:
// safe.directory must already be in effect before git will inspect a checkout
// owned by the host user from an agent sandbox account. A .git directory is a
// normal checkout; a .git file is a linked worktree.
function repositoryRoot(root) {
  let current = path.resolve(root);
  while (true) {
    if (fs.existsSync(path.join(current, ".git"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function safeGitArgs(root, args) {
  const repo = repositoryRoot(root);
  return repo ? ["-c", `safe.directory=${repo}`, ...args] : args;
}

function git(root, args) {
  return execFileSync("git", ["-C", root, ...safeGitArgs(root, args)], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function isRepo(root) {
  try {
    return git(root, ["rev-parse", "--is-inside-work-tree"]).trim() === "true";
  } catch {
    return false;
  }
}

// Stage and commit exactly `paths`. Anything already staged elsewhere stays staged
// and out of the commit (`git commit -- <paths>` is a partial commit).
function commitPaths(root, paths, message) {
  if (!isRepo(root)) return { sha: null, skipped: "not a git repository" };
  if (!Array.isArray(paths) || paths.length === 0) throw new Error("commitPaths: no paths");
  git(root, ["add", "--", ...paths]);
  if (git(root, ["status", "--porcelain", "--", ...paths]).trim() === "") {
    return { sha: null, skipped: "nothing to commit" };
  }
  git(root, ["commit", "-m", message, "--", ...paths]);
  return { sha: git(root, ["rev-parse", "HEAD"]).trim() };
}

module.exports = { git, isRepo, commitPaths, safeGitArgs };
