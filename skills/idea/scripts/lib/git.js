"use strict";
// Thin git wrappers for the idea skill. execFileSync without a shell; never pushes.

const { execFileSync } = require("node:child_process");

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], {
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

module.exports = { git, isRepo, commitPaths };
